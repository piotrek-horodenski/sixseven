/**
 * Maszyna stanów meczu — CZYSTA logika przejść (bez DB, bez IO, bez settings).
 *
 * To serce cyklu życia sekretu. Trzyma tylko to, co potrzebne do zdecydowania
 * o następnej fazie; wszystkie efekty uboczne (zapis sealed, wywołanie /resolve,
 * transakcyjny zapis wyniku, ustawienie deadline) wykonuje engine na podstawie
 * zwracanego `effect`. Dzięki temu logika jest w 100% testowalna bez środowiska.
 *
 * Diagram (IMPLEMENTATION_PLAN.md „Maszyna stanów meczu"):
 *
 *   Lobby ──start──► Planning
 *   Planning ──close_phase (deadline LUB komplet)──► [seal] ──► Resolving
 *   Resolving ──resolve_ok──► Revealing | Planning(next) | Finished
 *   Resolving ──resolve_fail ×retryMax──► Paused
 *   Revealing ──reveal_done──► Planning(next) | Finished
 *   Paused ──resume (health ok)──► Resolving (retry)
 *   Paused ──pause_timeout──► Cancelled
 *   Lobby ──lobby_timeout──► Cancelled
 *   {Lobby|Planning} ──cancel──► Cancelled
 *
 * Idempotencja (A5): zdarzenie nieadekwatne do bieżącej fazy zwraca
 * `changed: false` bez zmiany stanu — to model warunkowego update'u
 * („zamknij fazę tylko jeśli nadal planning i round == N"). Podwójny trigger
 * (np. deadline i komplet ruchów jednocześnie) nie psuje stanu.
 */

export type Phase =
  | 'lobby'
  | 'planning'
  | 'resolving'
  | 'revealing'
  | 'finished'
  | 'paused'
  | 'cancelled'

/**
 * Intent efektu, który engine ma wykonać po przejściu. Sама maszyna niczego nie
 * zapisuje — tylko opisuje, co trzeba zrobić.
 */
export type Effect =
  | 'open_planning'         // ustaw deadline planowania, wyczyść ready/moves rundy
  | 'seal_and_resolve'      // zapisz sealed (atomowo) PRZED /resolve, potem wywołaj /resolve
  | 'retry_resolve'         // ponów /resolve (świeży podpis, ten sam matchId+round)
  | 'apply_result_reveal'   // zapisz wynik w transakcji, wejdź w reveal
  | 'apply_result_advance'  // zapisz wynik w transakcji, otwórz kolejną rundę (bez revealu)
  | 'apply_result_finish'   // zapisz wynik w transakcji, zakończ mecz
  | 'pause'                 // oznacz Paused, ustaw deadline pauzy
  | 'cancel'                // oznacz Cancelled, oznacz historię cancelled

export interface MatchFsm {
  phase: Phase
  round: number
  /** Kolejne nieudane próby /resolve w bieżącej rundzie (A4). */
  failCount: number
  /** Ustawiane przy resolve_ok z revealem: czy po revealie mecz się kończy. */
  pendingFinish: boolean
}

export type EngineEvent =
  | { type: 'start' }
  | { type: 'close_phase' }
  | { type: 'resolve_ok'; finished: boolean; revealDurationMs: number }
  | { type: 'resolve_fail' }
  | { type: 'reveal_done' }
  | { type: 'resume' }
  | { type: 'pause_timeout' }
  | { type: 'lobby_timeout' }
  | { type: 'cancel' }

export interface TransitionConfig {
  /** Liczba prób /resolve w rundzie zanim Paused (settings.resolveRetryMax). */
  retryMax: number
}

export interface TransitionResult {
  next: MatchFsm
  /** Czy zdarzenie faktycznie zmieniło stan (false = idempotentny no-op). */
  changed: boolean
  /** Intent efektu dla engine (obecny tylko gdy changed === true). */
  effect?: Effect
}

function noop(state: MatchFsm): TransitionResult {
  return { next: state, changed: false }
}

/**
 * Czysta funkcja przejścia. Nie mutuje wejścia — zwraca nowy obiekt stanu.
 */
export function transition(
  state: MatchFsm,
  event: EngineEvent,
  config: TransitionConfig,
): TransitionResult {
  switch (state.phase) {
    case 'lobby':
      if (event.type === 'start') {
        return {
          next: { ...state, phase: 'planning', round: 1, failCount: 0, pendingFinish: false },
          changed: true,
          effect: 'open_planning',
        }
      }
      if (event.type === 'lobby_timeout' || event.type === 'cancel') {
        return { next: { ...state, phase: 'cancelled' }, changed: true, effect: 'cancel' }
      }
      return noop(state)

    case 'planning':
      if (event.type === 'close_phase') {
        // Zapieczętowanie (A1) wykonuje engine w ramach effect: seal_and_resolve.
        return {
          next: { ...state, phase: 'resolving', failCount: 0, pendingFinish: false },
          changed: true,
          effect: 'seal_and_resolve',
        }
      }
      if (event.type === 'cancel') {
        return { next: { ...state, phase: 'cancelled' }, changed: true, effect: 'cancel' }
      }
      return noop(state)

    case 'resolving':
      if (event.type === 'resolve_ok') {
        if (event.revealDurationMs > 0) {
          return {
            next: { ...state, phase: 'revealing', failCount: 0, pendingFinish: event.finished },
            changed: true,
            effect: 'apply_result_reveal',
          }
        }
        // Bez revealu — od razu dalej.
        if (event.finished) {
          return {
            next: { ...state, phase: 'finished', failCount: 0, pendingFinish: false },
            changed: true,
            effect: 'apply_result_finish',
          }
        }
        return {
          next: { ...state, phase: 'planning', round: state.round + 1, failCount: 0, pendingFinish: false },
          changed: true,
          effect: 'apply_result_advance',
        }
      }
      if (event.type === 'resolve_fail') {
        const failCount = state.failCount + 1
        if (failCount >= config.retryMax) {
          return { next: { ...state, phase: 'paused', failCount }, changed: true, effect: 'pause' }
        }
        return { next: { ...state, failCount }, changed: true, effect: 'retry_resolve' }
      }
      if (event.type === 'cancel') {
        return { next: { ...state, phase: 'cancelled' }, changed: true, effect: 'cancel' }
      }
      return noop(state)

    case 'revealing':
      if (event.type === 'reveal_done') {
        if (state.pendingFinish) {
          return {
            next: { ...state, phase: 'finished', pendingFinish: false },
            changed: true,
            effect: 'apply_result_finish',
          }
        }
        return {
          next: { ...state, phase: 'planning', round: state.round + 1, failCount: 0, pendingFinish: false },
          changed: true,
          effect: 'open_planning',
        }
      }
      if (event.type === 'cancel') {
        return { next: { ...state, phase: 'cancelled' }, changed: true, effect: 'cancel' }
      }
      return noop(state)

    case 'paused':
      if (event.type === 'resume') {
        // Ponowny /resolve tymi samymi zapieczętowanymi ruchami. failCount reset —
        // po powrocie serwis dostaje świeży komplet prób.
        return { next: { ...state, phase: 'resolving', failCount: 0 }, changed: true, effect: 'retry_resolve' }
      }
      if (event.type === 'pause_timeout' || event.type === 'cancel') {
        return { next: { ...state, phase: 'cancelled' }, changed: true, effect: 'cancel' }
      }
      return noop(state)

    case 'finished':
    case 'cancelled':
      // Stany terminalne — nic ich nie rusza (idempotentne).
      return noop(state)

    default:
      return noop(state)
  }
}
