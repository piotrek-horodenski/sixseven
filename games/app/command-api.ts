import express from 'express'
import crypto from 'crypto'

import type { CreateMatchInput } from './engine/engine'
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
  start(matchId: string): Promise<void>
  submitMove(matchId: string, playerId: string, move: unknown): Promise<'accepted' | 'rejected'>
  revealDone(matchId: string): Promise<void>
}

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
) => Promise<{ ok: boolean; state: unknown | null }>

export interface CommandDeps {
  engine: EngineCommands
  internalSecret: string
  getRegistration: (gameId: string) => Promise<GameRegistrationInfo | null>
  init: InitFn
  genId?: () => string
  genSeed?: () => string
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function createCommandRouter(deps: CommandDeps): express.Router {
  const router = express.Router()
  const genId = deps.genId ?? (() => crypto.randomBytes(12).toString('hex'))
  const genSeed = deps.genSeed ?? (() => crypto.randomBytes(16).toString('hex'))

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
      const { gameId, players, guestIds, ranked, options } = req.body ?? {}
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
      const initRes = await deps.init(reg.endpoint, {
        matchId,
        manifestVersion: reg.version,
        playerIds: players,
        seed,
        playerData: {},
        options: options ?? {},
      })
      if (!initRes.ok) {
        res.status(502).json({ error: 'game init failed' })
        return
      }
      await deps.engine.createMatch({
        matchId,
        gameId,
        manifestVersion: reg.version,
        players,
        guestIds,
        ranked,
        options,
        initialState: initRes.state,
      })
      res.json({ ok: true, matchId })
    } catch (err) {
      logger.error({ err }, 'create-match failed')
      res.status(500).json({ error: 'internal error' })
    }
  })

  router.post('/start', async (req, res) => {
    const { matchId } = req.body ?? {}
    if (typeof matchId !== 'string') {
      res.status(400).json({ error: 'matchId required' })
      return
    }
    await deps.engine.start(matchId)
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

  return router
}
