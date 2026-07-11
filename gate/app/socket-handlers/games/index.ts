import { HandlerObject } from '..'
import { createGamesHandlers } from './games.handler'
import { createGamesClient, GamesClient } from '../../services/games-client'
import { SettingsService } from '../../settings.service'

/**
 * Leniwa inicjalizacja realnego klienta gate→games. Konfiguracja (GAMES_URL,
 * INTERNAL_SECRET) czytana jest przy PIERWSZYM wywołaniu komendy, nie przy
 * imporcie — dzięki temu załadowanie barrela socket-handlers (a więc i testy
 * innych handlerów) nie odpala walidacji env ani nie buduje klienta.
 */
let client: GamesClient | null = null
function getClient(): GamesClient {
  if (!client) {
    const settings = SettingsService()
    client = createGamesClient({
      baseUrl: settings.gamesUrl,
      internalSecret: settings.internalSecret,
    })
  }
  return client
}

// Handlery delegują do leniwego klienta — bez efektu ubocznego przy imporcie.
const lazyClient: GamesClient = {
  createMatch: (input) => getClient().createMatch(input),
  start: (matchId, playerId) => getClient().start(matchId, playerId),
  submitMove: (matchId, playerId, move) => getClient().submitMove(matchId, playerId, move),
  revealDone: (matchId) => getClient().revealDone(matchId),
  getMatch: (matchId) => getClient().getMatch(matchId),
}

export const gamesHandlers: HandlerObject[] = createGamesHandlers(lazyClient)
