import express from 'express'
import crypto from 'crypto'

import type { CreateMatchInput, AddPlayerResult } from './engine/engine'
import type { GameServiceEndpoint } from './engine/resolve-client'
import logger from './logger'

/**
 * Command API — HTTP endpointy komend meczu, proxowane z gate (klient → gate →
 * games). „Komendy przez HTTP, stan przez change streams" (ARCHITECTURE): stan
 * gracz dostaje subskrypcją, komendy wołaniem, które zwraca ack/błąd.
 *
 * Auth wewnętrzny: współdzielony sekret gate↔games w nagłówku `x-sixseven-internal`
 * (porównanie w stałym czasie). Router jest w pełni WSTRZYKIWALNY (engine,
 * rejestracja, init) — testuje się bez bazy i sieci.
 *
 * create-match woła najpierw `/init` serwisu gry (stan początkowy liczy GRA),
 * potem zakłada mecz z tym stanem.
 */

export interface EngineCommands {
  createMatch(input: CreateMatchInput): Promise<string>
  /** Brama gotowości lobby (Etap 3 pkt 5): Planning startuje po komplecie rosteru. */
  playerReady(matchId: string, playerId: string): Promise<void>
  submitMove(matchId: string, playerId: string, move: unknown): Promise<'accepted' | 'rejected'>
  revealDone(matchId: string): Promise<void>
  /** Dołączenie gracza do meczu w lobby (Etap 3B pkt 2). */
  addPlayer(matchId: string, playerId: string, kind: 'user' | 'guest', initialState: unknown): Promise<AddPlayerResult>
  /** Anulowanie meczu (Etap 3B pkt 6 — leave twórcy w lobby). */
  cancel(matchId: string, reason: 'cancelled_lobby' | 'cancelled_paused' | 'cancelled'): Promise<void>
}

/** Pamięć gracza per gra (Etap 3B pkt 4/5): `{ data, prefs }`, brak wpisu = `{}`/`{}`. */
export type LoadPlayerMemoryFn = (
  gameId: string,
  playerIds: string[],
) => Promise<Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }>>

export type GetPrefsFn = (gameId: string, playerId: string) => Promise<Record<string, unknown>>
export type SetPrefsFn = (gameId: string, playerId: string, prefs: Record<string, unknown>) => Promise<void>

export interface GameRegistrationInfo {
  version: string
  endpoint: GameServiceEndpoint
}

export type InitFn = (
  endpoint: GameServiceEndpoint,
  request: {
    matchId: string
    manifestVersion: string
    playerIds: string[]
    seed: string
    playerData: Record<string, unknown>
    options: Record<string, unknown>
  },
) => Promise<{ ok: boolean; state: unknown | null; manifest?: { planningPhaseMs?: number; [key: string]: unknown } | null }>

export interface MatchInfo {
  matchId: string
  gameId: string
  players: string[]
  guestIds: string[]
  phase: string
  /** Potrzebne do re-init przy dołączeniu (join-match) — opcjonalne wstecznie. */
  capacity?: number
  options?: Record<string, unknown>
  manifestVersion?: string
}

export interface CommandDeps {
  engine: EngineCommands
  internalSecret: string
  getRegistration: (gameId: string) => Promise<GameRegistrationInfo | null>
  init: InitFn
  /** Odczyt meczu do weryfikacji członkostwa (2d handoff/token meczu) i re-init (join-match). */
  getMatch?: (matchId: string) => Promise<MatchInfo | null>
  genId?: () => string
  genSeed?: () => string
  /** Wstrzykiwalny odczyt player_memory (Etap 3B pkt 4). Domyślnie z kolekcji `player_memory`. */
  loadPlayerMemory?: LoadPlayerMemoryFn
  /** Odczyt/zapis prefs per (gra, gracz) poza meczem (Etap 3B pkt 5). Domyślnie `player_memory`. */
  getPrefs?: GetPrefsFn
  setPrefs?: SetPrefsFn
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/** Limit rozmiaru prefs (Etap 3B pkt 5) — ~4KB, serializacja JSON. */
const MAX_PREFS_BYTES = 4096

async function defaultLoadPlayerMemory(
  gameId: string,
  playerIds: string[],
): Promise<Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }>> {
  // Lazy require: brak efektu ubocznego (import modelu) przy imporcie modułu/testach.
  const { PlayerMemory } = await import('./models')
  const docs = await PlayerMemory.find({ gameId, playerId: { $in: playerIds } })
  const map: Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }> = {}
  for (const pid of playerIds) map[pid] = { data: {}, prefs: {} }
  for (const doc of docs as any[]) {
    map[String(doc.playerId)] = { data: doc.data ?? {}, prefs: doc.prefs ?? {} }
  }
  return map
}

async function defaultGetPrefs(gameId: string, playerId: string): Promise<Record<string, unknown>> {
  const { PlayerMemory } = await import('./models')
  const doc = await PlayerMemory.findOne({ gameId, playerId })
  return (doc as any)?.prefs ?? {}
}

async function defaultSetPrefs(gameId: string, playerId: string, prefs: Record<string, unknown>): Promise<void> {
  const { PlayerMemory } = await import('./models')
  await PlayerMemory.updateOne(
    { gameId, playerId },
    { $set: { prefs, updatedAt: Date.now() } },
    { upsert: true },
  )
}

export function createCommandRouter(deps: CommandDeps): express.Router {
  const router = express.Router()
  const genId = deps.genId ?? (() => crypto.randomBytes(12).toString('hex'))
  const genSeed = deps.genSeed ?? (() => crypto.randomBytes(16).toString('hex'))
  const loadPlayerMemory = deps.loadPlayerMemory ?? defaultLoadPlayerMemory
  const getPrefs = deps.getPrefs ?? defaultGetPrefs
  const setPrefs = deps.setPrefs ?? defaultSetPrefs

  // Auth wewnętrzny (stały czas) na wszystkich endpointach komend.
  router.use((req, res, next) => {
    const provided = String(req.header('x-sixseven-internal') ?? '')
    if (!provided || !safeEqual(provided, deps.internalSecret)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  })

  router.post('/create-match', async (req, res) => {
    try {
      const { gameId, players, guestIds, capacity, ranked, options } = req.body ?? {}
      if (typeof gameId !== 'string' || !Array.isArray(players) || players.length === 0) {
        res.status(400).json({ error: 'gameId and players required' })
        return
      }
      const reg = await deps.getRegistration(gameId)
      if (!reg) {
        res.status(404).json({ error: 'game not registered' })
        return
      }
      const matchId = genId()
      const seed = genSeed()
      // Pełny skład = zalogowani gracze + goście. Gra (init/resolve) nie rozróżnia
      // typu tożsamości — musi znać KAŻDEGO uczestnika, żeby policzyć jego wynik.
      const roster = [...players, ...(Array.isArray(guestIds) ? guestIds : [])]
      // Etap 3B pkt 4: prefs/dane graczy z player_memory — paliwo dla np. RPS fallback.
      const playerData = await loadPlayerMemory(gameId, roster)
      const initRes = await deps.init(reg.endpoint, {
        matchId,
        manifestVersion: reg.version,
        playerIds: roster,
        seed,
        playerData,
        options: options ?? {},
      })
      if (!initRes.ok) {
        res.status(502).json({ error: 'game init failed' })
        return
      }

      // Czas fazy planowania jest atrybutem GRY (manifest, ustawiany przez twórcę).
      // Przenosimy go z manifestu (zwróconego przez /init) do opcji meczu — silnik
      // czyta `match.options.planningPhaseMs` przy otwieraniu każdej rundy.
      const manifestPlanningMs = Number(initRes.manifest?.planningPhaseMs)
      const mergedOptions = {
        ...(options && typeof options === 'object' ? options : {}),
        ...(Number.isFinite(manifestPlanningMs) ? { planningPhaseMs: manifestPlanningMs } : {}),
      }

      await deps.engine.createMatch({
        matchId,
        gameId,
        manifestVersion: reg.version,
        players,
        guestIds,
        capacity: typeof capacity === 'number' && capacity > 0 ? capacity : undefined,
        ranked,
        options: mergedOptions,
        initialState: initRes.state,
      })
      res.json({ ok: true, matchId })
    } catch (err) {
      logger.error({ err }, 'create-match failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  router.post('/start', async (req, res) => {
    const { matchId, playerId } = req.body ?? {}
    if (typeof matchId !== 'string' || typeof playerId !== 'string') {
      res.status(400).json({ error: 'matchId and playerId required' })
      return
    }
    await deps.engine.playerReady(matchId, playerId)
    res.json({ ok: true })
  })

  router.post('/submit-move', async (req, res) => {
    const { matchId, playerId, move } = req.body ?? {}
    if (typeof matchId !== 'string' || typeof playerId !== 'string') {
      res.status(400).json({ error: 'matchId and playerId required' })
      return
    }
    const result = await deps.engine.submitMove(matchId, playerId, move)
    if (result === 'rejected') {
      res.status(409).json({ ok: false, status: 'rejected' })
      return
    }
    res.json({ ok: true, status: 'accepted' })
  })

  router.post('/reveal-done', async (req, res) => {
    const { matchId } = req.body ?? {}
    if (typeof matchId !== 'string') {
      res.status(400).json({ error: 'matchId required' })
      return
    }
    // 2c minimalnie: pierwszy reveal-done posuwa fazę (albo timeout schedulera).
    // Per-gracz „komplet reveal-done" to refinement (2e).
    await deps.engine.revealDone(matchId)
    res.json({ ok: true })
  })

  // Weryfikacja członkostwa (2d): gate pyta o mecz przed wystawieniem handoffu /
  // wymianą kodu na token meczu. Zwraca wyłącznie metadane potrzebne bramce —
  // NIGDY treści ruchów ani stanu prywatnego (I1).
  router.post('/get-match', async (req, res) => {
    const { matchId } = req.body ?? {}
    if (typeof matchId !== 'string' || !matchId) {
      res.status(400).json({ error: 'matchId required' })
      return
    }
    if (!deps.getMatch) {
      res.status(500).json({ error: 'get-match not configured' })
      return
    }
    const match = await deps.getMatch(matchId)
    if (!match) {
      res.status(404).json({ error: 'match not found' })
      return
    }
    res.json({
      matchId: match.matchId,
      gameId: match.gameId,
      players: match.players,
      guestIds: match.guestIds,
      phase: match.phase,
    })
  })

  // Dołączenie gracza do meczu w lobby (Etap 3B pkt 2): guard (lobby/duplikat/slot),
  // dopisanie do rosteru, re-init z pełnym rosterem (prefs z player_memory jak przy
  // create-match), nadpisanie stanu wejściowego rundy 1. Mecz w lobby, bez ruchów —
  // re-init jest bezpieczny.
  router.post('/join-match', async (req, res) => {
    try {
      const { matchId, playerId, kind } = req.body ?? {}
      if (typeof matchId !== 'string' || !matchId || typeof playerId !== 'string' || !playerId) {
        res.status(400).json({ error: 'matchId and playerId required' })
        return
      }
      const playerKind: 'user' | 'guest' = kind === 'guest' ? 'guest' : 'user'

      if (!deps.getMatch) {
        res.status(500).json({ error: 'get-match not configured' })
        return
      }
      const match = await deps.getMatch(matchId)
      if (!match) {
        res.status(404).json({ error: 'match not found' })
        return
      }
      if (match.phase !== 'lobby') {
        res.status(409).json({ error: 'match not open' })
        return
      }

      const capacity = match.capacity ?? 2
      const currentSize = match.players.length + match.guestIds.length
      const alreadyMember = match.players.includes(playerId) || match.guestIds.includes(playerId)
      if (alreadyMember) {
        // Idempotentne: powtórny join (np. odświeżenie) nie wywołuje ponownego /init.
        res.json({ ok: true, matchId, playerId, full: currentSize >= capacity })
        return
      }
      if (currentSize >= capacity) {
        res.status(409).json({ error: 'match is full' })
        return
      }

      const reg = await deps.getRegistration(match.gameId)
      if (!reg) {
        res.status(404).json({ error: 'game not registered' })
        return
      }

      const roster = [...match.players, ...match.guestIds, playerId]
      const playerData = await loadPlayerMemory(match.gameId, roster)
      const initRes = await deps.init(reg.endpoint, {
        matchId,
        manifestVersion: match.manifestVersion ?? reg.version,
        playerIds: roster,
        seed: genSeed(),
        playerData,
        options: match.options ?? {},
      })
      if (!initRes.ok) {
        res.status(502).json({ error: 'game init failed' })
        return
      }

      const result = await deps.engine.addPlayer(matchId, playerId, playerKind, initRes.state)
      if (result === 'duplicate') {
        res.json({ ok: true, matchId, playerId, full: currentSize >= capacity })
        return
      }
      if (result !== 'added') {
        // 'full' | 'not-lobby' (wyścig: faza się zmieniła między guardem a zapisem) → 409.
        const status = result === 'not-found' ? 404 : 409
        res.status(status).json({ error: result })
        return
      }

      res.json({ ok: true, matchId, playerId, full: roster.length >= capacity })
    } catch (err) {
      logger.error({ err }, 'join-match failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  // Anulowanie meczu (Etap 3B pkt 6 — twórca opuszcza lobby przed startem).
  // `engine.cancel` jest samo-guardowane (maszyna stanów): no-op dla meczów
  // już zakończonych/anulowanych.
  router.post('/cancel-match', async (req, res) => {
    try {
      const { matchId, reason } = req.body ?? {}
      if (typeof matchId !== 'string' || !matchId) {
        res.status(400).json({ error: 'matchId required' })
        return
      }
      const validReasons = ['cancelled_lobby', 'cancelled_paused', 'cancelled'] as const
      const r = validReasons.includes(reason) ? reason : 'cancelled_lobby'
      await deps.engine.cancel(matchId, r)
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err }, 'cancel-match failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  // Odczyt/zapis prefs per (user, gra) POZA meczem (Etap 3B pkt 5 — ekran preferencji).
  router.post('/get-prefs', async (req, res) => {
    try {
      const { gameId, playerId } = req.body ?? {}
      if (typeof gameId !== 'string' || !gameId || typeof playerId !== 'string' || !playerId) {
        res.status(400).json({ error: 'gameId and playerId required' })
        return
      }
      const prefs = await getPrefs(gameId, playerId)
      res.json({ prefs })
    } catch (err) {
      logger.error({ err }, 'get-prefs failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  router.post('/set-prefs', async (req, res) => {
    try {
      const { gameId, playerId, prefs } = req.body ?? {}
      if (typeof gameId !== 'string' || !gameId || typeof playerId !== 'string' || !playerId) {
        res.status(400).json({ error: 'gameId and playerId required' })
        return
      }
      if (typeof prefs !== 'object' || prefs === null || Array.isArray(prefs)) {
        res.status(400).json({ error: 'prefs must be an object' })
        return
      }
      const bytes = Buffer.byteLength(JSON.stringify(prefs), 'utf8')
      if (bytes > MAX_PREFS_BYTES) {
        res.status(413).json({ error: 'prefs too large' })
        return
      }
      await setPrefs(gameId, playerId, prefs)
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err }, 'set-prefs failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  return router
}
