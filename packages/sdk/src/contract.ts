/**
 * Wire contract gry sixseven — kanoniczne typy i interfejs `GameDefinition`.
 *
 * Model (ARCHITECTURE.md / IMPLEMENTATION_PLAN.md): logika gry to BEZSTANOWE
 * HTTP wołane przez platformę. Jedna runda = jeden `POST /resolve` (stan +
 * surowe ruchy + lista spóźnionych + wersja manifestu → nowy stan, events,
 * punkty, widoki per gracz, finished, revealDurationMs). Ruchy opuszczają
 * platformę DOPIERO po zamknięciu fazy planowania (I2). Podpis HMAC + budżet
 * czasu + limit rozmiaru egzekwuje warstwa `serve`.
 *
 * Te typy są źródłem prawdy dla twórcy gry. Silnik platformy (games) mówi tym
 * samym kontraktem po drugiej stronie drutu.
 */

export type PlayerId = string

export interface PlayerData {
  /** pisane przez annotate() po meczu, ≤ 4 KB */
  data: Record<string, unknown>
  /** pisane przez UI gry tokenem meczu, ≤ 4 KB */
  prefs: Record<string, unknown>
}

export interface InitInput {
  playerIds: PlayerId[]
  seed: string
  playerData: Record<PlayerId, PlayerData>
  options: Record<string, unknown>
}

/**
 * Wejście do `/init` po drucie: InitInput + tożsamość meczu i wersja manifestu.
 * Stan początkowy meczu liczy GRA (nie klient/platforma) — dlatego to osobne
 * wywołanie do serwisu gry przy tworzeniu meczu.
 */
export interface InitRequest extends InitInput {
  matchId: string
  manifestVersion: string
}

/** Wyjście z `/init`: stan początkowy meczu. */
export interface InitResponse {
  state: unknown
}

/** Ruch jednego gracza w żądaniu (treść nieznana typom — waliduje ją gra). */
export interface PlayerMove {
  playerId: PlayerId
  move: unknown
}

/** Widok jednego gracza po rundzie (trafia do prywatnego per-gracz match_views). */
export interface PlayerView {
  playerId: PlayerId
  view: unknown
}

/**
 * Wejście do `/resolve` (to, co platforma wysyła). Niesie wersję manifestu,
 * z którą mecz wystartował (C3), i klucz idempotencji `${matchId}:${round}` (A4).
 */
export interface ResolveRequest {
  matchId: string
  round: number
  idempotencyKey: string
  manifestVersion: string
  state: unknown
  moves: PlayerMove[]
  latePlayers: PlayerId[]
}

/** Wyjście z `/resolve` (to, co gra zwraca po drucie). */
export interface ResolveResponse {
  state: unknown
  events: unknown[]
  points: Record<PlayerId, number>
  views: PlayerView[]
  finished: boolean
  revealDurationMs: number
}

/**
 * Ruch po walidacji, przekazywany do `resolve` gry. `defaulted=true` oznacza,
 * że gracz nie złożył ruchu albo złożył nielegalny — `serve` podstawił
 * `defaultMove`. Gra decyduje, czy i jak zaraportować to w `events`.
 */
export interface ResolvedMove<M = unknown> {
  playerId: PlayerId
  move: M
  defaulted: boolean
}

/** Wynik zwracany przez `resolve` gry (serve mapuje go na ResolveResponse). */
export interface ResolveResult<S = unknown> {
  state: S
  events?: unknown[]
  points?: Record<PlayerId, number>
  views: PlayerView[]
  finished: boolean
  revealDurationMs: number
}

/** Manifest gry — deklaracja tożsamości, wersji i ograniczeń. */
export interface GameManifest {
  id: string
  name: string
  version: string
  /** Minimalny czas fazy planowania (walidacja: ≥ 2000 ms). */
  planningPhaseMs: number
  /** Schemat opcji/presetów (dowolny — walidowany przez rejestrację w Etapie 5). */
  options?: Record<string, unknown>
  /** Pula odznak/tytułów, które gra może przyznawać (adnotacje). */
  badges?: { id: string; sentiment: 'positive' | 'neutral' | 'negative' }[]
}

/**
 * Kontrakt, który implementuje twórca gry. Wszystko jest CZYSTE i
 * DETERMINISTYCZNE — ten sam wejściowy stan + ruchy muszą dawać ten sam wynik
 * (egzekwuje harness `sixseven-sdk test`). `serve` opakowuje to w HTTP.
 *
 * @typeParam S — typ stanu gry
 * @typeParam M — typ pojedynczego ruchu
 */
export interface GameDefinition<S = unknown, M = unknown> {
  manifest: GameManifest

  /** Stan początkowy meczu. */
  init(input: InitInput): S

  /** Czy `move` jest legalny w danym stanie dla danego gracza. */
  validateMove(move: unknown, state: S, playerId: PlayerId): move is M

  /** Ruch domyślny (dla spóźnionych / nielegalnych). Musi być deterministyczny. */
  defaultMove(state: S, playerId: PlayerId): M

  /** Rozstrzygnięcie rundy. Deterministyczne. */
  resolve(state: S, moves: ResolvedMove<M>[]): ResolveResult<S>
}

export const SDK_STAGE = '2b'
