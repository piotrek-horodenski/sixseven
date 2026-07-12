import { HandlerObject } from '..'
import { createGuestConvertHandlers } from './guest-convert.handler'
import { registerAccount } from '../../services/account.service'
import { createGamesClient, GamesClient } from '../../services/games-client'
import { SettingsService } from '../../settings.service'

/**
 * Wiązanie produkcyjne konwersji gościa: realny `registerAccount` (account.service),
 * leniwy klient gate→games (attachGuest), dzienny limit per IP z configu.
 * Konfiguracja/klient czytane leniwie — barrel nie odpala walidacji env.
 */

let client: GamesClient | null = null
function getClient(): GamesClient {
  if (!client) {
    const settings = SettingsService()
    client = createGamesClient({ baseUrl: settings.gamesUrl, internalSecret: settings.internalSecret })
  }
  return client
}

let dailyLimit: number | null = null
function getDailyLimit(): number {
  if (dailyLimit === null) dailyLimit = SettingsService().guestConvertDailyLimit
  return dailyLimit
}

export const guestConvertHandlers: HandlerObject[] = createGuestConvertHandlers({
  registerAccount: (input, opts) => registerAccount(input, opts),
  attachGuest: (args) => getClient().attachGuest(args),
  get dailyLimit() { return getDailyLimit() },
})
