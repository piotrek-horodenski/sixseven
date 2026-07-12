import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection } from '@/composables/useCollection'
import {
  RPS_GAME_ID,
  ACTIVE_PHASES,
  DONE_PHASES,
  type Match,
  type MatchView,
  type RpsMove,
} from './games.model'

/**
 * Store meczów (2c). Dwa źródła prawdy, oba subskrybowane (Etap 1, row-level):
 *  - `matches`     — jawny stan sterujący (faza, runda, deadline, ready, score),
 *  - `match_views` — co temu graczowi wolno zobaczyć po rundzie (reveal RPS).
 *
 * Komendy (create/start/submit-move/reveal-done) idą socketem do gate, który
 * mapuje JWT → playerId i proxuje do games. Wynik przychodzi ackiem
 * (`*-complete` / `*-error` / `submit-move-rejected`) ORAZ — dla stanu gry —
 * osobno subskrypcją. Ack służy tylko do UX (nawigacja, błąd, „odrzucono").
 */
export const useGamesStore = defineStore('games', () => {
  const gate = useGateStore()

  const matchesCol = useCollection<Match>('matches')
  const viewsCol = useCollection<MatchView>('match_views')

  const matches = matchesCol.docs
  const matchViews = viewsCol.docs

  const started = ref(false)
  const lastError = ref<string | null>(null)
  const creating = ref(false)
  const lastCreatedMatchId = ref<string | null>(null)
  /** matchId, dla których ostatni submit został odrzucony (409) — do UX. */
  const rejectedMatchIds = ref<Set<string>>(new Set())

  const currentUserId = computed<string | null>(() => gate.user?._id ?? null)

  const myMatches = computed(() =>
    [...matches.value].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  )
  const activeMatches = computed(() =>
    myMatches.value.filter((m) => ACTIVE_PHASES.includes(m.phase)),
  )
  const finishedMatches = computed(() =>
    myMatches.value.filter((m) => DONE_PHASES.includes(m.phase)),
  )

  function matchById(id: string): Match | undefined {
    return matches.value.find((m) => m._id === id)
  }

  /** Najświeższy widok gracza dla danego meczu (najwyższa runda). */
  function latestView(matchId: string): MatchView | undefined {
    return matchViews.value
      .filter((v) => v.matchId === matchId)
      .sort((a, b) => b.round - a.round)[0]
  }

  function opponentId(match: Match | undefined): string | null {
    if (!match || !currentUserId.value) return null
    return match.players.find((p) => p !== currentUserId.value) ?? null
  }

  // ---- acki (UX) --------------------------------------------------------

  function onCreateComplete({ matchId }: { matchId: string }) {
    creating.value = false
    lastError.value = null
    lastCreatedMatchId.value = matchId
  }
  function onCreateError({ message }: { message?: string }) {
    creating.value = false
    lastError.value = message || t('games.errors.createFailed')
  }
  function onError({ message }: { message?: string }) {
    lastError.value = message || t('games.errors.operationFailed')
  }
  function onSubmitRejected({ matchId }: { matchId: string }) {
    const next = new Set(rejectedMatchIds.value)
    next.add(matchId)
    rejectedMatchIds.value = next
  }
  function onSubmitComplete({ matchId }: { matchId: string }) {
    if (!rejectedMatchIds.value.has(matchId)) return
    const next = new Set(rejectedMatchIds.value)
    next.delete(matchId)
    rejectedMatchIds.value = next
  }

  function registerAcks() {
    const s = gate.socket
    if (!s) return
    const pairs: [string, (...a: any[]) => void][] = [
      ['games:create-match-complete', onCreateComplete],
      ['games:create-match-error', onCreateError],
      ['games:start-error', onError],
      ['games:submit-move-error', onError],
      ['games:submit-move-rejected', onSubmitRejected],
      ['games:submit-move-complete', onSubmitComplete],
      ['games:reveal-done-error', onError],
    ]
    for (const [event, handler] of pairs) {
      s.off(event, handler)
      s.on(event, handler)
    }
  }

  function unregisterAcks() {
    const s = gate.socket
    if (!s) return
    s.off('games:create-match-complete', onCreateComplete)
    s.off('games:create-match-error', onCreateError)
    s.off('games:start-error', onError)
    s.off('games:submit-move-error', onError)
    s.off('games:submit-move-rejected', onSubmitRejected)
    s.off('games:submit-move-complete', onSubmitComplete)
    s.off('games:reveal-done-error', onError)
  }

  // ---- cykl życia -------------------------------------------------------

  function init() {
    if (started.value) return
    started.value = true
    registerAcks()
    gate.onReconnect(registerAcks)
    matchesCol.start()
    viewsCol.start()
  }

  function cleanup() {
    if (!started.value) return
    matchesCol.stop()
    viewsCol.stop()
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    lastCreatedMatchId.value = null
    rejectedMatchIds.value = new Set()
    started.value = false
  }

  // ---- komendy ----------------------------------------------------------

  function clearError() {
    lastError.value = null
  }

  /** Tworzy mecz RPS z jednym przeciwnikiem. Gate dokleja twórcę jako gracza. */
  function createRpsMatch(opponent: string, target = 2, ranked = false) {
    lastError.value = null
    lastCreatedMatchId.value = null
    creating.value = true
    gate.call('games:create-match', {
      gameId: RPS_GAME_ID,
      players: [opponent],
      ranked,
      options: { target },
    })
  }

  function start(matchId: string) {
    lastError.value = null
    gate.call('games:start', { matchId })
  }

  function submitMove(matchId: string, move: RpsMove) {
    lastError.value = null
    const next = new Set(rejectedMatchIds.value)
    next.delete(matchId)
    rejectedMatchIds.value = next
    gate.call('games:submit-move', { matchId, move })
  }

  function revealDone(matchId: string) {
    gate.call('games:reveal-done', { matchId })
  }

  return {
    // stan
    matches,
    matchViews,
    started,
    lastError,
    creating,
    lastCreatedMatchId,
    rejectedMatchIds,
    currentUserId,
    // gettery
    myMatches,
    activeMatches,
    finishedMatches,
    matchById,
    latestView,
    opponentId,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    createRpsMatch,
    start,
    submitMove,
    revealDone,
  }
})
