/**
 * Wire contract silnik ↔ serwis gry (ARCHITECTURE.md „Kontrakt gry (SDK)").
 *
 * Jedna runda = jeden `POST /resolve`. Serwis gry jest BEZSTANOWY — cały stan
 * trzyma i przekazuje platforma. Te typy są współdzielone przez engine (który
 * buduje żądanie) i resolve-client (który je podpisuje i wysyła); pełny SDK dla
 * twórców gier (`packages/sdk`) powstaje w podetapie 2b.
 *
 * Kanoniczna serializacja: JSON. Ciało podpisywane HMAC-em jest DOKŁADNIE tym
 * ciałem, które idzie po drucie (bajt w bajt) — patrz resolve-client.
 */

/** Wejście do `/init` — stan początkowy meczu liczy GRA, nie platforma. */
export interface InitRequest {
  matchId: string
  manifestVersion: string
  playerIds: string[]
  seed: string
  playerData: Record<string, { data: Record<string, unknown>; prefs: Record<string, unknown> }>
  options: Record<string, unknown>
}

/** Wyjście z `/init`. */
export interface InitResponse {
  state: unknown
}

/** Ruch jednego gracza przekazany do logiki po zamknięciu fazy (stan 4). */
export interface PlayerMove {
  playerId: string
  move: unknown
}

/**
 * Wejście do `/resolve`. Niesie WERSJĘ MANIFESTU, z którą mecz wystartował (C3):
 * dev wie, którą wersją logiki obsłużyć stan, a replay-audit nie generuje
 * fałszywych pozytywów po legalnej zmianie wersji.
 */
export interface ResolveRequest {
  matchId: string
  round: number
  /** Klucz idempotencji: `${matchId}:${round}` — ta sama runda = ten sam klucz (A4). */
  idempotencyKey: string
  manifestVersion: string
  /** Stan autorytatywny na wejściu do rundy (z match_states). */
  state: unknown
  /** Surowe ruchy graczy (sekret opuszcza platformę dopiero tutaj, stan 4). */
  moves: PlayerMove[]
  /** Gracze bez ruchu — logika stosuje defaultMove. */
  latePlayers: string[]
}

/** Widok jednego gracza po rundzie (trafia do prywatnego per-gracz match_views). */
export interface PlayerView {
  playerId: string
  view: unknown
}

/**
 * Wyjście z `/resolve`: nowy stan autorytatywny, jawne zdarzenia rundy, punkty,
 * widoki per gracz, czy mecz się skończył i jak długo trwa reveal.
 */
export interface ResolveResponse {
  state: unknown
  events: unknown[]
  points: Record<string, number>
  views: PlayerView[]
  finished: boolean
  revealDurationMs: number
}

/** Wynik pojedynczej próby wywołania `/resolve` (do resolve_log, A4). */
export type ResolveOutcome = 'ok' | 'timeout' | 'schema' | 'error'

export interface ResolveAttempt {
  attempt: number
  outcome: ResolveOutcome
  response: ResolveResponse | null
}
