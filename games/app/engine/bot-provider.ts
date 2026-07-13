import crypto from 'crypto'

import type { AddPlayerResult } from './engine'

/**
 * Bot-zawodnik (Etap 4f — kontrakt `docs/ETAP4F_BOT_CONTRACT.md`). Zastępuje
 * scaffold noop z 4e. Dwie odpowiedzialności, obie wołane z ticku schedulera:
 *
 *  1) `maybeJoinLobby` — gdy lobby czeka z wolnym slotem (brak przeciwnika),
 *     po progu czasu dosadza bota jako gościa (`bot_<hex>` w `guestIds`).
 *  2) `maybePlay` — w meczu w fazie `planning` bot AKTYWNIE składa LOSOWY ruch
 *     (nie polega na `defaultMove`, który dla gościa jest deterministyczny i
 *     przewidywalny z publicznego seedu). Złożony ruch trafia do prywatnej
 *     `moves` — replay-safe (audyt czyta zapis, nie przelicza).
 *
 * MVP (decyzja Piotra 2026-07-13): działa TYLKO dla gier z zaszytą strategią
 * ruchu (dziś `rps`), bo platforma jest agnostyczna wobec reguł gry. Ogólna droga
 * (kontraktowy `/bot-move` albo deklaracja przestrzeni ruchów w manifeście) = DŁUG.
 */

/** Prefiks id bota — wzór jak goście `g_…`. Wspólny helper (games + web). */
export const BOT_ID_PREFIX = 'bot_'

/** Czy dany identyfikator należy do bota (nie do usera/gościa). */
export function isBotId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(BOT_ID_PREFIX)
}

/** Przestrzeń ruchów RPS — zaszyta (MVP; docelowo z gry, patrz kontrakt „DŁUG"). */
const RPS_MOVES = ['rock', 'paper', 'scissors'] as const

/** Losowy legalny ruch RPS (crypto-entropia — NIE deterministyczny hashMove). */
export function randomRpsMove(): string {
  return RPS_MOVES[crypto.randomInt(RPS_MOVES.length)]
}

/** Metadane meczu w lobby (bez treści ruchów/stanu — I1). */
export interface LobbyMatchInfo {
  matchId: string
  gameId: string
  players: string[]
  guestIds: string[]
  capacity: number
  createdAt: number
  /** Wersja manifestu meczu (do `/init` przy dołączaniu bota). */
  manifestVersion: string
  /** Opcje meczu (do `/init`). */
  options: Record<string, unknown>
}

/** Metadane meczu w fazie planning z co najmniej jednym botem. */
export interface PlanningMatchInfo {
  matchId: string
  gameId: string
  round: number
  botIds: string[]
}

export interface BotProvider {
  /** Wołany per mecz w lobby z wolnym slotem. Może dosadzić bota. */
  maybeJoinLobby(match: LobbyMatchInfo): Promise<void>
  /** Wołany per mecz w planning z botem. Bot składa losowy ruch (raz na rundę). */
  maybePlay(match: PlanningMatchInfo): Promise<void>
}

/** Generator losowego ruchu dla danej gry (MVP: tylko `rps`). */
export type BotMoveStrategy = () => unknown

export interface BotProviderDeps {
  getRegistration(
    gameId: string,
  ): Promise<{ version: string; endpoint: { url: string; secret: string } } | null>
  init(
    endpoint: { url: string; secret: string },
    request: {
      matchId: string
      manifestVersion: string
      playerIds: string[]
      seed: string
      playerData: Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }>
      options: Record<string, unknown>
    },
  ): Promise<{ ok: boolean; state: unknown }>
  loadPlayerMemory(
    gameId: string,
    playerIds: string[],
  ): Promise<Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }>>
  addPlayer(
    matchId: string,
    playerId: string,
    kind: 'user' | 'guest',
    initialState: unknown,
    nick?: string,
  ): Promise<AddPlayerResult>
  playerReady(matchId: string, playerId: string): Promise<void>
  submitMove(matchId: string, playerId: string, move: unknown): Promise<'accepted' | 'rejected'>
  hasSubmitted(matchId: string, round: number, playerId: string): Promise<boolean>
  genSeed(): string
  now(): number
  /** Generator id bota. Domyślnie `bot_<hex>`. */
  genBotId?: () => string
}

export interface BotConfig {
  /** Globalny wyłącznik. */
  enabled: boolean
  /** Ile pusty slot w lobby „czeka" na człowieka, zanim dosiądzie bot. */
  joinWaitMs: number
  /** Nick bota zapisywany w `matches.nicks` (UI lokalizuje etykietę po prefiksie). */
  nick: string
  /** Strategie ruchu per gra (MVP: `{ rps: randomRpsMove }`). Brak wpisu = brak bota. */
  strategies: Record<string, BotMoveStrategy>
}

/** Domyślny provider (testy rdzenia/deadline bez botów). */
export const noopBotProvider: BotProvider = {
  async maybeJoinLobby(): Promise<void> {
    // celowo puste
  },
  async maybePlay(): Promise<void> {
    // celowo puste
  },
}

export function createBotProvider(deps: BotProviderDeps, config: BotConfig): BotProvider {
  const genBotId = deps.genBotId ?? (() => `${BOT_ID_PREFIX}${crypto.randomBytes(8).toString('hex')}`)

  function humanCount(match: LobbyMatchInfo): number {
    // Gość-człowiek liczy się, bot NIE (nie tworzymy meczów samych botów).
    return match.players.length + match.guestIds.filter((id) => !isBotId(id)).length
  }

  return {
    async maybeJoinLobby(match: LobbyMatchInfo): Promise<void> {
      if (!config.enabled) return
      if (!config.strategies[match.gameId]) return // MVP: tylko gry z zaszytą strategią
      if (deps.now() - match.createdAt < config.joinWaitMs) return // pusty slot musi poczekać
      if (humanCount(match) < 1) return // dosiadamy tylko, gdy czeka człowiek

      const reg = await deps.getRegistration(match.gameId)
      if (!reg) return

      // Migawka rosteru — wypełniamy do capacity, JEDEN bot naraz (rosnący roster
      // → osobne /init). Dla domyślnych 2-os. gier to dokładnie jeden bot.
      const players = [...match.players]
      const guestIds = [...match.guestIds]
      const addedBots: string[] = []

      while (players.length + guestIds.length < match.capacity) {
        const botId = genBotId()
        const roster = [...players, ...guestIds, botId]
        const playerData = await deps.loadPlayerMemory(match.gameId, roster)
        const initRes = await deps.init(reg.endpoint, {
          matchId: match.matchId,
          manifestVersion: match.manifestVersion || reg.version,
          playerIds: roster,
          seed: deps.genSeed(),
          playerData,
          options: match.options ?? {},
        })
        if (!initRes.ok) break
        const result = await deps.addPlayer(match.matchId, botId, 'guest', initRes.state, config.nick)
        if (result !== 'added') break // 'full'/'not-lobby' (wyścig) → przestań dokładać
        guestIds.push(botId)
        addedBots.push(botId)
      }

      // Auto-gotowość bota; ostatnie `playerReady` wyzwoli `start`, gdy człowiek już
      // gotowy i roster pełny.
      for (const botId of addedBots) {
        await deps.playerReady(match.matchId, botId)
      }
    },

    async maybePlay(match: PlanningMatchInfo): Promise<void> {
      if (!config.enabled) return
      const strat = config.strategies[match.gameId]
      if (!strat) return
      for (const botId of match.botIds) {
        if (await deps.hasSubmitted(match.matchId, match.round, botId)) continue
        await deps.submitMove(match.matchId, botId, strat())
      }
    },
  }
}
