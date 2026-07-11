import express from 'express'

import { connectDb } from './db'
import { settings } from './settings'
import logger from './logger'
import { models, Registration, Match } from './models'
import { MatchEngine } from './engine/engine'
import { Scheduler } from './engine/scheduler'
import { callInit } from './engine/init-client'
import { createRegistrationResolver } from './services/register-game'
import { createCommandRouter } from './command-api'

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
  const scheduler = new Scheduler(engine)
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
      getRegistration: async (gameId) => {
        const reg = await Registration.findOne({ gameId, status: 'active' })
        if (!reg) return null
        return {
          version: reg.version as string,
          endpoint: { url: reg.serviceUrl as string, secret: reg.hmacSecret as string },
        }
      },
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
