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
  addPlayer(matchId: string, playerId: string, kind: 'user' | 'guest', initialState: unknown, nick?: string): Promise<AddPlayerResult>
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

// ─── Adnotacje + historia + goście (Etap 4b/4c, OBSZAR A3) ──────────────────

export type Sentiment = 'positive' | 'neutral' | 'negative'

/** Zapis pojedynczej adnotacji/odznaki (Etap 4b, MINIMALNY). */
export type AnnotateFn = (input: {
  playerId: string
  gameId: string
  badgeId: string
  sentiment: Sentiment
  params: Record<string, unknown>
  earnedAt: number
}) => Promise<void>

/** Wynik meczu z punktu widzenia gracza (argmax score). */
export type MatchResult = 'win' | 'loss' | 'draw'

export interface PlayerHistory {
  /** Agregat per gra. */
  games: { gameId: string; played: number; wins: number; losses: number; draws: number }[]
  /** Ostatnie N meczów (malejąco po finishedAt). `score` to pełna mapa playerId→punkty. */
  recent: {
    matchId: string
    gameId: string
    finishedAt: number | null
    result: MatchResult
    score: Record<string, number>
  }[]
}

export type PlayerHistoryFn = (userId: string, gameId?: string) => Promise<PlayerHistory>

export type GuestMatchesFn = (
  guestId: string,
  sinceMs: number,
) => Promise<{ matchId: string; gameId: string; finishedAt: number | null }[]>

/** Podpięcie meczów gościa do konta w oknie [windowStartMs, ∞). Zwraca liczbę NOWO przeniesionych. */
export type AttachGuestFn = (guestId: string, userId: string, windowStartMs: number) => Promise<number>

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
  /** Zegar (Etap 4c — okno 7 dni dla attach-guest, earnedAt adnotacji). Domyślnie `Date.now`. */
  now?: () => number
  /** Zapis adnotacji (Etap 4b). Domyślnie kolekcja `annotations`. */
  annotate?: AnnotateFn
  /** Historia meczów gracza (Etap 4b). Domyślnie z `matches`. */
  playerHistory?: PlayerHistoryFn
  /** Mecze gościa w oknie (Etap 4c). Domyślnie z `matches`. */
  guestMatches?: GuestMatchesFn
  /** Podpięcie meczów gościa do konta (Etap 4c). Domyślnie mutacja `matches`. */
  attachGuest?: AttachGuestFn
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

/** Limit rozmiaru `params` adnotacji (Etap 4b) — ~1 KB, serializacja JSON. */
const MAX_ANNOTATION_PARAMS_BYTES = 1024

/** Ile ostatnich meczów zwraca player-history. */
const RECENT_MATCHES_LIMIT = 20

/** Okno podpięcia meczów gościa (Etap 4c): 7 dni. Liczone w games (kontrakt decyzja #5). */
const GUEST_ATTACH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const VALID_SENTIMENTS: readonly Sentiment[] = ['positive', 'neutral', 'negative']

/**
 * Wynik meczu dla gracza z mapy `score` (playerId→punkty). Zwycięzca = UNIKALNY
 * max; remis = współdzielony max; inaczej porażka. `userScore` startuje jako
 * kandydat na max, więc gracz jest liczony nawet gdy nie ma go w mapie (score 0).
 */
function deriveResult(score: Record<string, unknown>, userId: string): MatchResult {
  const map = score ?? {}
  const userScore = Number((map as Record<string, unknown>)[userId] ?? 0)
  let max = userScore
  for (const v of Object.values(map)) {
    const n = Number(v)
    if (Number.isFinite(n) && n > max) max = n
  }
  if (userScore < max) return 'loss'
  // userScore === max: policz, ilu uczestników dzieli maksimum.
  let sharers = 0
  let userCounted = false
  for (const [pid, v] of Object.entries(map)) {
    if (Number(v) === max) {
      sharers++
      if (pid === userId) userCounted = true
    }
  }
  if (!userCounted) sharers++ // gracz dzieli max, ale nie ma wpisu w mapie
  return sharers === 1 ? 'win' : 'draw'
}

/** Czy mecz liczy się do historii: zakończony i NIE anulowany. */
function isCountedFinished(phase: unknown, endReason: unknown): boolean {
  return phase === 'finished' && !(typeof endReason === 'string' && endReason.startsWith('cancelled'))
}

async function defaultAnnotate(input: {
  playerId: string
  gameId: string
  badgeId: string
  sentiment: Sentiment
  params: Record<string, unknown>
  earnedAt: number
}): Promise<void> {
  const { Annotation } = await import('./models')
  // Etap 5: walidacja badgeId/params względem puli manifestu gry. Tu MINIMALNY zapis.
  await Annotation.create({
    playerId: input.playerId,
    gameId: input.gameId,
    badgeId: input.badgeId,
    sentiment: input.sentiment,
    params: input.params,
    earnedAt: input.earnedAt,
    createdAt: input.earnedAt,
  })
}

async function defaultPlayerHistory(userId: string, gameId?: string): Promise<PlayerHistory> {
  const { Match } = await import('./models')
  const filter: Record<string, unknown> = { players: userId, phase: 'finished' }
  if (gameId) filter.gameId = gameId
  // Malejąco po czasie zakończenia (updatedAt = moment przejścia w 'finished').
  const docs = (await Match.find(filter).sort({ updatedAt: -1 })) as any[]

  const agg = new Map<string, { gameId: string; played: number; wins: number; losses: number; draws: number }>()
  const recent: PlayerHistory['recent'] = []
  for (const doc of docs) {
    if (!isCountedFinished(doc.phase, doc.endReason)) continue
    const gid = String(doc.gameId)
    const score = (doc.score ?? {}) as Record<string, number>
    const result = deriveResult(score, userId)

    const g = agg.get(gid) ?? { gameId: gid, played: 0, wins: 0, losses: 0, draws: 0 }
    g.played++
    if (result === 'win') g.wins++
    else if (result === 'loss') g.losses++
    else g.draws++
    agg.set(gid, g)

    if (recent.length < RECENT_MATCHES_LIMIT) {
      recent.push({
        matchId: String(doc._id),
        gameId: gid,
        finishedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : null,
        result,
        score,
      })
    }
  }
  return { games: [...agg.values()], recent }
}

async function defaultGuestMatches(
  guestId: string,
  sinceMs: number,
): Promise<{ matchId: string; gameId: string; finishedAt: number | null }[]> {
  const { Match } = await import('./models')
  const docs = (await Match.find({ guestIds: guestId, createdAt: { $gte: sinceMs } }).sort({
    createdAt: -1,
  })) as any[]
  return docs.map((d) => ({
    matchId: String(d._id),
    gameId: String(d.gameId),
    // finishedAt tylko dla zakończonych (brak osobnego pola — updatedAt = czas finiszu).
    finishedAt: d.phase === 'finished' && typeof d.updatedAt === 'number' ? d.updatedAt : null,
  }))
}

async function defaultAttachGuest(guestId: string, userId: string, windowStartMs: number): Promise<number> {
  const { Match } = await import('./models')
  // Podpina mecze z okna 7 dni, w których guestId WCIĄŻ figuruje jako gość. `$pull`
  // usuwa guestId, `$addToSet` dokłada userId do `players` (mecz staje się kontowy).
  // Idempotentne: po przeniesieniu filtr `guestIds: guestId` już NIE trafia w dokument,
  // więc modifiedCount liczy tylko NOWO przeniesione. Filtr po guestId nie rusza meczów
  // innego gościa; w meczu ruszamy TYLKO tego guestId ($pull konkretnej wartości).
  // Zero ELO/rankingu — do 4e nie ma wpisów rankingowych, te mecze ich nie generują.
  const res = await Match.updateMany(
    { guestIds: guestId, createdAt: { $gte: windowStartMs } },
    { $pull: { guestIds: guestId }, $addToSet: { players: userId }, $set: { updatedAt: Date.now() } },
  )
  return (res.modifiedCount as number) ?? 0
}

export function createCommandRouter(deps: CommandDeps): express.Router {
  const router = express.Router()
  const genId = deps.genId ?? (() => crypto.randomBytes(12).toString('hex'))
  const genSeed = deps.genSeed ?? (() => crypto.randomBytes(16).toString('hex'))
  const loadPlayerMemory = deps.loadPlayerMemory ?? defaultLoadPlayerMemory
  const getPrefs = deps.getPrefs ?? defaultGetPrefs
  const setPrefs = deps.setPrefs ?? defaultSetPrefs
  const now = deps.now ?? (() => Date.now())
  const annotate = deps.annotate ?? defaultAnnotate
  const playerHistory = deps.playerHistory ?? defaultPlayerHistory
  const guestMatches = deps.guestMatches ?? defaultGuestMatches
  const attachGuest = deps.attachGuest ?? defaultAttachGuest

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
      const { gameId, players, guestIds, capacity, ranked, options, nicks, roomCode } = req.body ?? {}
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
        nicks: nicks && typeof nicks === 'object' ? nicks : undefined,
        roomCode: typeof roomCode === 'string' ? roomCode : undefined,
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
      const { matchId, playerId, kind, nick } = req.body ?? {}
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

      const result = await deps.engine.addPlayer(matchId, playerId, playerKind, initRes.state, typeof nick === 'string' ? nick : undefined)
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

  // ─── Adnotacje + historia + goście (Etap 4b/4c, OBSZAR A3) ──────────────────

  // Zapis adnotacji/odznaki (Etap 4b). MINIMALNY: waliduje tylko sentiment (enum)
  // i rozmiar params (~1 KB). Walidacja badgeId/params względem puli manifestu gry
  // to Etap 5. Zasila kolekcję `annotations` (widoczność egzekwuje polityka gate).
  router.post('/annotate', async (req, res) => {
    try {
      const { playerId, gameId, badgeId, sentiment, params } = req.body ?? {}
      if (
        typeof playerId !== 'string' || !playerId ||
        typeof gameId !== 'string' || !gameId ||
        typeof badgeId !== 'string' || !badgeId
      ) {
        res.status(400).json({ error: 'playerId, gameId and badgeId required' })
        return
      }
      if (!VALID_SENTIMENTS.includes(sentiment)) {
        res.status(400).json({ error: 'invalid sentiment' })
        return
      }
      let paramsObj: Record<string, unknown> = {}
      if (params !== undefined) {
        if (typeof params !== 'object' || params === null || Array.isArray(params)) {
          res.status(400).json({ error: 'params must be an object' })
          return
        }
        const bytes = Buffer.byteLength(JSON.stringify(params), 'utf8')
        if (bytes > MAX_ANNOTATION_PARAMS_BYTES) {
          res.status(413).json({ error: 'params too large' })
          return
        }
        paramsObj = params as Record<string, unknown>
      }
      await annotate({ playerId, gameId, badgeId, sentiment, params: paramsObj, earnedAt: now() })
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err }, 'annotate failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  // Historia meczów gracza (Etap 4b — sekcja profilu publicznego). Czysta funkcja
  // stanu: agregat win/loss/draw z `matches.score` (argmax) + ostatnie N meczów.
  router.post('/player-history', async (req, res) => {
    try {
      const { userId, gameId } = req.body ?? {}
      if (typeof userId !== 'string' || !userId) {
        res.status(400).json({ error: 'userId required' })
        return
      }
      if (gameId !== undefined && typeof gameId !== 'string') {
        res.status(400).json({ error: 'gameId must be a string' })
        return
      }
      const history = await playerHistory(userId, gameId || undefined)
      res.json({ history })
    } catch (err) {
      logger.error({ err }, 'player-history failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  // Mecze gościa w oknie (Etap 4c). Zwraca mecze, w których `guestIds` zawiera
  // guestId i `createdAt >= sinceMs`. guestId pochodzi z tokenu gościa po stronie
  // gate (anti-hijack) — tu tylko surowe zapytanie.
  router.post('/guest-matches', async (req, res) => {
    try {
      const { guestId, sinceMs } = req.body ?? {}
      if (typeof guestId !== 'string' || !guestId) {
        res.status(400).json({ error: 'guestId required' })
        return
      }
      if (typeof sinceMs !== 'number' || !Number.isFinite(sinceMs)) {
        res.status(400).json({ error: 'sinceMs must be a number' })
        return
      }
      const matches = await guestMatches(guestId, sinceMs)
      res.json({ matches })
    } catch (err) {
      logger.error({ err }, 'guest-matches failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  // Konwersja gościa (Etap 4c): podpięcie meczów gościa z okna 7 DNI do konta.
  // Okno liczone TU (games), z wstrzykiwalnego zegara. Idempotentne — `attached`
  // liczy tylko NOWO przeniesione mecze. Zero ELO (brak wpisów rankingowych do 4e).
  router.post('/attach-guest', async (req, res) => {
    try {
      const { guestId, userId } = req.body ?? {}
      if (typeof guestId !== 'string' || !guestId || typeof userId !== 'string' || !userId) {
        res.status(400).json({ error: 'guestId and userId required' })
        return
      }
      const windowStartMs = now() - GUEST_ATTACH_WINDOW_MS
      const attached = await attachGuest(guestId, userId, windowStartMs)
      res.json({ attached })
    } catch (err) {
      logger.error({ err }, 'attach-guest failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  return router
}
