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
  ranked?: boolean
  options?: Record<string, unknown>
}

export type CommandResult<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface GamesClient {
  createMatch(input: CreateMatchInput): Promise<CommandResult<{ matchId: string }>>
  start(matchId: string): Promise<CommandResult>
  submitMove(
    matchId: string,
    playerId: string,
    move: unknown,
  ): Promise<CommandResult<{ status: 'accepted' | 'rejected' }>>
  revealDone(matchId: string): Promise<CommandResult>
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

    async start(matchId) {
      const { status, body } = await guardedCall('/start', { matchId })
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
  }
}
