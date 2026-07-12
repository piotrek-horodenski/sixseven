import logger from '../logger'

/**
 * Klient HTTP gate→games (2c). „Komendy przez HTTP, stan przez change streams"
 * (ARCHITECTURE): gate przyjmuje komendę socketem od gracza, waliduje JWT i
 * proxuje ją do games command API (`/command/*`) z sekretem wewnętrznym w
 * nagłówku `x-sixseven-internal`. Stan gracz dostaje osobno — subskrypcją
 * `matches`/`match_views` (polityki row-level z Etapu 1).
 *
 * W pełni WSTRZYKIWALNY (`fetchImpl`) — testuje się bez sieci.
 *
 * Klient NIE wystawia żadnych kolekcji prywatnych games; przenosi wyłącznie
 * komendy i ich ack/błąd.
 */

export interface GamesClientConfig {
  /** Bazowy URL serwisu games (klient dokleja `/command/*`). */
  baseUrl: string
  /** Sekret wewnętrzny; musi być identyczny jak `settings.internalSecret` w games. */
  internalSecret: string
  /** Wstrzykiwalny fetch (test/keep-alive). Domyślnie globalny `fetch`. */
  fetchImpl?: typeof fetch
  /** Całkowity budżet czasu pojedynczej komendy (ms). */
  timeoutMs?: number
}

export interface CreateMatchInput {
  gameId: string
  players: string[]
  guestIds?: string[]
  /** Docelowa liczba graczy (Etap 3B pkt 1). Domyślnie 2 (schema games). */
  capacity?: number
  ranked?: boolean
  options?: Record<string, unknown>
}

export type CommandResult<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface MatchInfo {
  matchId: string
  gameId: string
  players: string[]
  guestIds: string[]
  phase: string
}

/** Agregat historii per gra (4b — profil publiczny). Kształt wg A3. */
export interface PlayerHistoryGame {
  gameId: string
  played: number
  wins: number
  losses: number
  draws: number
}

/** Ostatnie mecze (4b — profil publiczny). Kształt wg A3. */
export interface PlayerHistoryRecent {
  matchId: string
  gameId: string
  finishedAt: number | null
  result: 'win' | 'loss' | 'draw'
  score?: Record<string, number>
}

export interface PlayerHistory {
  games: PlayerHistoryGame[]
  recent: PlayerHistoryRecent[]
}

/** Mecz gościa w oknie konwersji (4c). Kształt wg A3. */
export interface GuestMatch {
  matchId: string
  gameId: string
  finishedAt: number
}

export interface GamesClient {
  createMatch(input: CreateMatchInput): Promise<CommandResult<{ matchId: string }>>
  /** Gracz zgłasza gotowość w lobby (Etap 3 pkt 5) — Planning startuje po komplecie rosteru. */
  start(matchId: string, playerId: string): Promise<CommandResult>
  submitMove(
    matchId: string,
    playerId: string,
    move: unknown,
  ): Promise<CommandResult<{ status: 'accepted' | 'rejected' }>>
  revealDone(matchId: string): Promise<CommandResult>
  /** Weryfikacja członkostwa (2d): odczyt meczu do handoffu i wymiany tokenu. */
  getMatch(matchId: string): Promise<CommandResult<MatchInfo>>
  /** Dołączenie do meczu w lobby (Etap 3B pkt 2). `full` = slot się właśnie zapełnił. */
  joinMatch(matchId: string, playerId: string, kind: 'user' | 'guest'): Promise<CommandResult<{ full: boolean }>>
  /** Anulowanie meczu (Etap 3B pkt 6 — leave twórcy w lobby). Domyślny powód: cancelled_lobby. */
  cancelMatch(matchId: string, reason?: 'cancelled_lobby' | 'cancelled_paused' | 'cancelled'): Promise<CommandResult>
  /** Odczyt prefs per (gra, gracz) POZA meczem (Etap 3B pkt 5 — ekran preferencji). */
  getPrefs(gameId: string, playerId: string): Promise<CommandResult<{ prefs: Record<string, unknown> }>>
  /** Zapis prefs per (gra, gracz) POZA meczem. */
  setPrefs(gameId: string, playerId: string, prefs: Record<string, unknown>): Promise<CommandResult>
  /**
   * Historia meczów gracza (4b — profil publiczny). `gameId` zawęża do jednej gry.
   * Źródło: agregat `matches` po stronie games (A3).
   */
  playerHistory(userId: string, gameId?: string): Promise<CommandResult<PlayerHistory>>
  /**
   * Mecze gościa od `sinceMs` (4c — okno konwersji). Zwraca listę meczów, w których
   * `guestId` uczestniczył jako gość.
   */
  guestMatches(guestId: string, sinceMs: number): Promise<CommandResult<{ matches: GuestMatch[] }>>
  /**
   * Podpięcie meczów gościa do świeżo utworzonego konta (4c). Games przenosi guestId
   * z `guestIds` do `players` dla meczów z okna 7 dni, zero ELO. Idempotentne.
   */
  attachGuest(args: { guestId: string; userId: string }): Promise<CommandResult<{ attached: number }>>
}

const DEFAULT_TIMEOUT_MS = 5000

export function createGamesClient(config: GamesClientConfig): GamesClient {
  const doFetch = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Ucinamy końcowe `/`, żeby doklejanie ścieżki dawało jeden separator.
  const base = config.baseUrl.replace(/\/+$/, '')

  /**
   * Surowe wywołanie komendy. Zwraca zawsze { status, body } albo rzuca tylko
   * przy błędzie sieci/timeoutcie (mapowanym wyżej na status 0). Wywołujący
   * interpretuje status wg semantyki konkretnej komendy.
   */
  async function call(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(`${base}/command${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-sixseven-internal': config.internalSecret,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Zakaz podążania za redirectami — komendy idą tylko do znanego games.
        redirect: 'error',
      })
      let parsed: Record<string, unknown> = {}
      try {
        parsed = (await res.json()) as Record<string, unknown>
      } catch {
        parsed = {}
      }
      return { status: res.status, body: parsed }
    } finally {
      clearTimeout(timer)
    }
  }

  async function guardedCall(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    try {
      return await call(path, body)
    } catch (err) {
      logger.error({ err, path }, 'games command call failed (network)')
      return { status: 0, body: { error: 'games unreachable' } }
    }
  }

  function errorOf(status: number, body: Record<string, unknown>): string {
    return typeof body.error === 'string' ? body.error : `games returned ${status}`
  }

  return {
    async createMatch(input) {
      const { status, body } = await guardedCall('/create-match', input)
      if (status === 200 && typeof body.matchId === 'string') {
        return { ok: true, data: { matchId: body.matchId } }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async start(matchId, playerId) {
      const { status, body } = await guardedCall('/start', { matchId, playerId })
      if (status === 200) return { ok: true, data: {} }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async submitMove(matchId, playerId, move) {
      const { status, body } = await guardedCall('/submit-move', { matchId, playerId, move })
      // 200 → ruch przyjęty; 409 → ruch odrzucony (normalny wynik gry, nie błąd);
      // wszystko inne → błąd komendy.
      if (status === 200) return { ok: true, data: { status: 'accepted' } }
      if (status === 409) return { ok: true, data: { status: 'rejected' } }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async revealDone(matchId) {
      const { status, body } = await guardedCall('/reveal-done', { matchId })
      if (status === 200) return { ok: true, data: {} }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async getMatch(matchId) {
      const { status, body } = await guardedCall('/get-match', { matchId })
      if (status === 200 && typeof body.gameId === 'string') {
        return {
          ok: true,
          data: {
            matchId: String(body.matchId ?? matchId),
            gameId: body.gameId,
            players: Array.isArray(body.players) ? (body.players as string[]) : [],
            guestIds: Array.isArray(body.guestIds) ? (body.guestIds as string[]) : [],
            phase: typeof body.phase === 'string' ? body.phase : '',
          },
        }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async joinMatch(matchId, playerId, kind) {
      const { status, body } = await guardedCall('/join-match', { matchId, playerId, kind })
      if (status === 200 && body.ok === true) {
        return { ok: true, data: { full: body.full === true } }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async cancelMatch(matchId, reason) {
      const { status, body } = await guardedCall('/cancel-match', { matchId, reason: reason ?? 'cancelled_lobby' })
      if (status === 200) return { ok: true, data: {} }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async getPrefs(gameId, playerId) {
      const { status, body } = await guardedCall('/get-prefs', { gameId, playerId })
      if (status === 200) {
        const prefs = body.prefs && typeof body.prefs === 'object' && !Array.isArray(body.prefs)
          ? (body.prefs as Record<string, unknown>)
          : {}
        return { ok: true, data: { prefs } }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async setPrefs(gameId, playerId, prefs) {
      const { status, body } = await guardedCall('/set-prefs', { gameId, playerId, prefs })
      if (status === 200) return { ok: true, data: {} }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async playerHistory(userId, gameId) {
      // `gameId` opcjonalny — dokładamy tylko gdy podany (zawężenie do jednej gry).
      const payload: Record<string, unknown> = { userId }
      if (typeof gameId === 'string' && gameId) payload.gameId = gameId
      const { status, body } = await guardedCall('/player-history', payload)
      if (status === 200) {
        const raw = (body.history && typeof body.history === 'object' && !Array.isArray(body.history)
          ? (body.history as Record<string, unknown>)
          : {})
        const history: PlayerHistory = {
          games: Array.isArray(raw.games) ? (raw.games as PlayerHistoryGame[]) : [],
          recent: Array.isArray(raw.recent) ? (raw.recent as PlayerHistoryRecent[]) : [],
        }
        return { ok: true, data: history }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async guestMatches(guestId, sinceMs) {
      const { status, body } = await guardedCall('/guest-matches', { guestId, sinceMs })
      if (status === 200) {
        const matches = Array.isArray(body.matches) ? (body.matches as GuestMatch[]) : []
        return { ok: true, data: { matches } }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },

    async attachGuest(args) {
      const { status, body } = await guardedCall('/attach-guest', { guestId: args.guestId, userId: args.userId })
      if (status === 200) {
        const attached = typeof body.attached === 'number' ? body.attached : Number(body.attached ?? 0)
        return { ok: true, data: { attached: Number.isFinite(attached) ? attached : 0 } }
      }
      return { ok: false, status, error: errorOf(status, body) }
    },
  }
}
