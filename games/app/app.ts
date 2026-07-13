import crypto from 'crypto'

import express from 'express'

import { connectDb } from './db'
import { settings } from './settings'
import logger from './logger'
import { models, Registration, Match } from './models'
import { MatchEngine } from './engine/engine'
import { Scheduler } from './engine/scheduler'
import { callInit } from './engine/init-client'
import { createBotProvider, randomRpsMove } from './engine/bot-provider'
import { createRegistrationResolver } from './services/register-game'
import { createCommandRouter, defaultLoadPlayerMemory } from './command-api'

/**
 * games — serwis skarbca (silnik meczów, matchmaking, trust).
 *
 * PODETAP 2c: boot bazy + rejestracja modeli + pętla harmonogramu (A5) + resolver
 * endpointu serwisu gry z kolekcji `registrations`. Endpointy komend (submit-move
 * itd. proxowane z gate) dochodzą w dalszej części 2c.
 *
 * Kolekcje prywatne games (moves, match_states, resolve_log, player_memory,
 * registrations) NIE są nigdy wystawiane przez gate — default-deny z Etapu 1.
 */
export async function boot(): Promise<void> {
  await connectDb()
  logger.info({ collections: models.map((m) => m.name) }, 'models registered')

  const engine = new MatchEngine({
    // 2c: endpoint serwisu gry pochodzi z kolekcji `registrations`.
    resolveEndpoint: createRegistrationResolver(),
  })

  // Rozwiązanie endpointu gry z rejestracji — wspólne dla komend i bota (Etap 4f).
  const getRegistration = async (gameId: string) => {
    const reg = await Registration.findOne({ gameId, status: 'active' })
    if (!reg) return null
    return {
      version: reg.version as string,
      endpoint: { url: reg.serviceUrl as string, secret: reg.hmacSecret as string },
    }
  }

  // Bot-zawodnik (Etap 4f): dosiada do lobby casual z wolnym slotem i składa losowy
  // ruch. MVP — wspierany tylko RPS (zaszyta strategia; patrz ETAP4F_BOT_CONTRACT.md).
  const botProvider = createBotProvider(
    {
      getRegistration,
      init: (endpoint, request) => callInit(endpoint, request as never),
      loadPlayerMemory: defaultLoadPlayerMemory,
      addPlayer: (matchId, playerId, kind, initialState, nick) =>
        engine.addPlayer(matchId, playerId, kind, initialState, nick),
      playerReady: (matchId, playerId) => engine.playerReady(matchId, playerId),
      submitMove: (matchId, playerId, move) => engine.submitMove(matchId, playerId, move),
      hasSubmitted: (matchId, round, playerId) => engine.hasMove(matchId, round, playerId),
      genSeed: () => crypto.randomBytes(16).toString('hex'),
      now: () => Date.now(),
    },
    {
      enabled: settings.botEnabled,
      joinWaitMs: settings.botJoinWaitMs,
      nick: 'Bot',
      strategies: { rps: randomRpsMove },
    },
  )

  const scheduler = new Scheduler(engine, undefined, undefined, undefined, { botProvider })
  scheduler.start()

  const app = express()
  app.use(express.json())
  app.get('/health', (_req, res) => {
    res.json({ service: 'games', status: 'ok', stage: '2c' })
  })

  // Komendy meczu proxowane z gate (auth: sekret wewnętrzny).
  app.use(
    '/command',
    createCommandRouter({
      engine,
      internalSecret: settings.internalSecret,
      getRegistration,
      init: (endpoint, request) => callInit(endpoint, request as never),
      getMatch: async (matchId) => {
        const m = await Match.findById(matchId)
        if (!m) return null
        return {
          matchId: String(m._id),
          gameId: m.gameId as string,
          players: (m.players as string[]) ?? [],
          guestIds: (m.guestIds as string[]) ?? [],
          phase: m.phase as string,
          capacity: (m.capacity as number) ?? 2,
          options: (m.options as Record<string, unknown>) ?? {},
          manifestVersion: m.manifestVersion as string,
        }
      },
    }),
  )

  await new Promise<void>((resolve) => {
    app.listen(settings.port, () => {
      logger.info({ port: settings.port }, 'games listening')
      resolve()
    })
  })
}
