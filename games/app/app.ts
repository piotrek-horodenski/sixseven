import express from 'express'

import { connectDb } from './db'
import { settings } from './settings'
import logger from './logger'
import { models } from './models'
import { MatchEngine } from './engine/engine'
import { Scheduler } from './engine/scheduler'

/**
 * games — serwis skarbca (silnik meczów, matchmaking, trust).
 *
 * PODETAP 2a: boot bazy + rejestracja modeli (7 kolekcji) + pętla harmonogramu
 * (deadline'y w dokumentach, A5). Endpointy komend (submit-move itd. proxowane
 * z gate) oraz rejestracja gier dochodzą w 2c — dlatego resolver endpointu
 * serwisu gry jest na razie stubem (w produkcji 2a nie ma jeszcze meczów).
 *
 * Kolekcje prywatne games (moves, match_states, resolve_log, player_memory) NIE
 * są nigdy wystawiane przez gate — default-deny z Etapu 1 je blokuje.
 */
export async function boot(): Promise<void> {
  await connectDb()
  logger.info({ collections: models.map((m) => m.name) }, 'models registered')

  const engine = new MatchEngine({
    // 2a: brak kolekcji `registrations` — URL i sekret serwisu gry dojdą w 2c.
    resolveEndpoint: async (gameId) => {
      throw new Error(`game not registered: ${gameId} (rejestracja w podetapie 2c)`)
    },
  })
  const scheduler = new Scheduler(engine)
  scheduler.start()

  const app = express()
  app.use(express.json())
  app.get('/health', (_req, res) => {
    res.json({ service: 'games', status: 'ok', stage: '2a' })
  })

  await new Promise<void>((resolve) => {
    app.listen(settings.port, () => {
      logger.info({ port: settings.port }, 'games listening')
      resolve()
    })
  })
}
