import { Registration } from '../models'
import { GameServiceEndpoint } from '../engine/resolve-client'

/**
 * Rejestracja gry (2c — minimalna, seed/ręcznie). Upsert po `gameId`:
 * idempotentne, więc re-seed nie tworzy duplikatów. Pełny pipeline (walidacja
 * manifestu, zdalne kontrakt-testy, approve) dochodzi w Etapie 5.
 */
export interface RegisterGameInput {
  gameId: string
  version: string
  serviceUrl: string
  hmacSecret: string
  name?: string
  manifest?: Record<string, unknown>
}

export async function registerGame(input: RegisterGameInput): Promise<void> {
  await Registration.updateOne(
    { gameId: input.gameId },
    {
      $set: {
        name: input.name ?? input.gameId,
        version: input.version,
        serviceUrl: input.serviceUrl,
        hmacSecret: input.hmacSecret,
        manifest: input.manifest ?? {},
        status: 'active',
        updatedAt: Date.now(),
      },
    },
    { upsert: true },
  )
}

/**
 * Resolver endpointu serwisu gry z kolekcji `registrations` — wstrzykiwany do
 * MatchEngine w miejsce stubu z 2a. Rzuca, gdy gra nieznana lub wyłączona.
 */
export function createRegistrationResolver(): (gameId: string) => Promise<GameServiceEndpoint> {
  return async (gameId: string) => {
    const reg = await Registration.findOne({ gameId, status: 'active' })
    if (!reg) {
      throw new Error(`game not registered or inactive: ${gameId}`)
    }
    return { url: reg.serviceUrl as string, secret: reg.hmacSecret as string }
  }
}
