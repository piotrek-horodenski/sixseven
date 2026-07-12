import { HandlerObject } from '..'
import { createProfileHandlers, PublicUser } from './profile.handler'
import { App } from '../../app'
import { createGamesClient, GamesClient } from '../../services/games-client'
import { SettingsService } from '../../settings.service'

/**
 * Wiązanie produkcyjne odczytu publicznego profilu: model `users` (tylko pola
 * publiczne) + leniwy klient gate→games (playerHistory). Konfiguracja czytana
 * leniwie — barrel nie odpala walidacji env.
 */

function getUserModel() {
  const model = App.models.find(m => m.name === 'users')?.model
  if (!model) throw new Error('users model not registered')
  return model
}

async function findPublicUser(userId: string): Promise<PublicUser | null> {
  try {
    // Wybieramy WYŁĄCZNIE pola publiczne (żadnego email/roles/permissions/sessions).
    const doc = await getUserModel().findById(userId).select('profile username').lean() as any
    if (!doc) return null
    const display = (doc.profile && typeof doc.profile.display === 'string' && doc.profile.display)
      ? doc.profile.display
      : (doc.username ?? '')
    return { userId: String(doc._id), display }
  } catch {
    // Błędny ObjectId itp. → traktujemy jak brak usera.
    return null
  }
}

let client: GamesClient | null = null
function getClient(): GamesClient {
  if (!client) {
    const settings = SettingsService()
    client = createGamesClient({ baseUrl: settings.gamesUrl, internalSecret: settings.internalSecret })
  }
  return client
}

export const profileHandlers: HandlerObject[] = createProfileHandlers({
  findPublicUser,
  playerHistory: (userId) => getClient().playerHistory(userId),
})
