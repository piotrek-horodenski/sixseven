import express from 'express'
import { Server } from 'http'

import { Registration, Match } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { callInit } from '../../app/engine/init-client'
import { createCommandRouter, CommandDeps } from '../../app/command-api'

/**
 * Wiring REALNY command-api (Etap 3 + 3B) do testów integracyjnych: ten sam
 * układ zależności co produkcyjny `app.ts` (rejestracja z `registrations`,
 * `/init` po HTTP przez `callInit`, `getMatch` z prawdziwego `Match`), ale
 * jako osobny serwer HTTP na losowym porcie, żeby testy mogły wołać
 * `create-match`/`join-match`/`/start`/`submit-move`/`get-prefs`/`set-prefs`
 * dokładnie tak, jak robi to gate.
 *
 * `loadPlayerMemory`/`getPrefs`/`setPrefs` NIE są nadpisywane domyślnie — jeśli
 * wywołujący nie poda `depsOverride`, command-api użyje swoich domyślnych
 * implementacji na prawdziwej kolekcji `player_memory` (patrz command-api.ts
 * `defaultLoadPlayerMemory`/`defaultGetPrefs`/`defaultSetPrefs`). To DOKŁADNIE
 * łańcuch, który chcemy zweryfikować end-to-end: player_memory → /init → RPS.
 */
export interface RealCommandApiOptions {
  engine: MatchEngine
  secret: string
  /** Zegar wstrzykiwany do /init (spójny z zegarem silnika w teście). */
  now?: () => number
  depsOverride?: Partial<CommandDeps>
}

export interface RealCommandApi {
  /** Bazowy URL WŁĄCZAJĄC `/command` (np. `http://127.0.0.1:PORT/command`). */
  base: string
  server: Server
  stop: () => Promise<void>
}

export async function startRealCommandApi(opts: RealCommandApiOptions): Promise<RealCommandApi> {
  const app = express()
  app.use(express.json())

  const deps: CommandDeps = {
    engine: opts.engine,
    internalSecret: opts.secret,
    getRegistration: async (gameId) => {
      const reg = await Registration.findOne({ gameId, status: 'active' })
      if (!reg) return null
      return {
        version: reg.version as string,
        endpoint: { url: reg.serviceUrl as string, secret: reg.hmacSecret as string },
      }
    },
    init: (endpoint, request) => callInit(endpoint, request as never, { now: opts.now?.() }),
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
    ...opts.depsOverride,
  }

  app.use('/command', createCommandRouter(deps))

  const server = app.listen(0)
  await new Promise<void>((r) => server.once('listening', () => r()))
  const port = (server.address() as any).port
  return {
    base: `http://127.0.0.1:${port}/command`,
    server,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  }
}
