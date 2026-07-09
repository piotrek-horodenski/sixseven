import express from 'express'

import { connectDb } from './db'
import { settings } from './settings'
import logger from './logger'
import { models } from './models'
import { MatchEngine } from './engine/engine'
import { Scheduler } from './engine/scheduler'
import { createRegistrationResolver } from './services/register-game'

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

  await new Promise<void>((resolve) => {
    app.listen(settings.port, () => {
      logger.info({ port: settings.port }, 'games listening')
      resolve()
    })
  })
}
