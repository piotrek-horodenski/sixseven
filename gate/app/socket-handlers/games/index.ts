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
// EKSPORTOWANY, żeby moduły dev/queue/admin-games używały tej samej leniwej
// instancji (jedna konfiguracja, jeden klient).
export const lazyClient: GamesClient = {
  createMatch: (input) => getClient().createMatch(input),
  start: (matchId, playerId) => getClient().start(matchId, playerId),
  submitMove: (matchId, playerId, move) => getClient().submitMove(matchId, playerId, move),
  revealDone: (matchId) => getClient().revealDone(matchId),
  getMatch: (matchId) => getClient().getMatch(matchId),
  joinMatch: (matchId, playerId, kind, nick) => getClient().joinMatch(matchId, playerId, kind, nick),
  cancelMatch: (matchId, reason) => getClient().cancelMatch(matchId, reason),
  getPrefs: (gameId, playerId) => getClient().getPrefs(gameId, playerId),
  setPrefs: (gameId, playerId, prefs) => getClient().setPrefs(gameId, playerId, prefs),
  // Metody społeczności (4b/4c) — dodane do interfejsu GamesClient przez A2.
  // Delegują jak reszta; leniwy klient musi w pełni pokrywać interfejs.
  playerHistory: (userId, gameId) => getClient().playerHistory(userId, gameId),
  guestMatches: (guestId, sinceMs) => getClient().guestMatches(guestId, sinceMs),
  attachGuest: (args) => getClient().attachGuest(args),
  // Metody 4d/4e (rejestr gier, kolejka, abandon) — delegacja jak reszta.
  registerGame: (input) => getClient().registerGame(input),
  updateGame: (input) => getClient().updateGame(input),
  approveGame: (gameId) => getClient().approveGame(gameId),
  unpublishGame: (gameId) => getClient().unpublishGame(gameId),
  queueJoin: (gameId, userId) => getClient().queueJoin(gameId, userId),
  queueLeave: (gameId, userId) => getClient().queueLeave(gameId, userId),
  queueAccept: (gameId, userId, proposalId) => getClient().queueAccept(gameId, userId, proposalId),
  abandon: (matchId, playerId) => getClient().abandon(matchId, playerId),
}

export const gamesHandlers: HandlerObject[] = createGamesHandlers(lazyClient)
