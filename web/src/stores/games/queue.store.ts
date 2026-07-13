import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection } from '@/composables/useCollection'
import type { QueueEntry } from './ranked.model'

/**
 * Store kolejki szybkiego meczu (Etap 4e). Jedno źródło prawdy: subskrypcja
 * kolekcji `queue` — polityka gate (row-level) oddaje WYŁĄCZNIE własne wpisy,
 * więc `entries` to zawsze „moje" dokumenty. Przebieg:
 *
 *   queue:join → wpis `waiting` (czas od `since`) → matchmaker games paruje →
 *   `proposed` (dialog akceptu z odliczaniem do `proposalDeadline`,
 *   queue:accept) → obaj zaakceptowali → `matched` + `matchId` → widok bierze
 *   handoff (`games:request-handoff` przez rooms.store) i wchodzi do gry.
 *
 * Komendy idą socketem usera (gość NIE ma dostępu — gate odrzuca), userId
 * ZAWSZE z tokenu. Acki służą tylko do UX (błąd/spinner); stan wpisu przychodzi
 * subskrypcją. Cykl życia refcount — wzorzec z `rooms.store.ts`.
 */
export const useQueueStore = defineStore('queue', () => {
  const gate = useGateStore()

  const queueCol = useCollection<QueueEntry>('queue')
  const entries = queueCol.docs

  const mounts = ref(0)
  const started = ref(false)
  const lastError = ref<string | null>(null)
  /** gameId, dla którego trwa join (spinner na kafelku). */
  const joiningGameId = ref<string | null>(null)
  const accepting = ref(false)

  /** Moje wpisy, najświeższy pierwszy (polityka i tak oddaje tylko własne). */
  const myEntries = computed(() =>
    [...entries.value].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  )

  /** Aktywny wpis kolejki (MVP: jeden naraz) — steruje overlayem na Home. */
  const activeEntry = computed<QueueEntry | null>(() => myEntries.value[0] ?? null)

  function entryFor(gameId: string): QueueEntry | undefined {
    return entries.value.find((e) => e.gameId === gameId)
  }

  // ---- acki (UX) ----------------------------------------------------------

  function onJoinComplete() {
    joiningGameId.value = null
    lastError.value = null
  }
  function onJoinError({ message }: { message?: string }) {
    joiningGameId.value = null
    lastError.value = message || t('home.quick.errors.join')
  }
  function onLeaveError({ message }: { message?: string }) {
    lastError.value = message || t('home.quick.errors.leave')
  }
  function onAcceptComplete() {
    accepting.value = false
    lastError.value = null
  }
  function onAcceptError({ message }: { message?: string }) {
    accepting.value = false
    lastError.value = message || t('home.quick.errors.accept')
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['queue:join-complete', onJoinComplete],
    ['queue:join-error', onJoinError],
    ['queue:leave-error', onLeaveError],
    ['queue:accept-complete', onAcceptComplete],
    ['queue:accept-error', onAcceptError],
  ]

  function registerAcks() {
    const s = gate.socket
    if (!s) return
    for (const [event, handler] of ackPairs) {
      s.off(event, handler)
      s.on(event, handler)
    }
  }

  function unregisterAcks() {
    const s = gate.socket
    if (!s) return
    for (const [event, handler] of ackPairs) {
      s.off(event, handler)
    }
  }

  // ---- cykl życia (refcount) ----------------------------------------------

  function init() {
    mounts.value += 1
    if (started.value) return
    started.value = true
    registerAcks()
    gate.onReconnect(registerAcks)
    queueCol.start()
  }

  function cleanup() {
    if (mounts.value > 0) mounts.value -= 1
    if (mounts.value > 0 || !started.value) return
    queueCol.stop()
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    joiningGameId.value = null
    started.value = false
  }

  // ---- komendy -------------------------------------------------------------

  function clearError() {
    lastError.value = null
  }

  /** Wejście do kolejki (idempotentne po stronie games — `since` zostaje). */
  function join(gameId: string) {
    lastError.value = null
    joiningGameId.value = gameId
    gate.call('queue:join', { gameId })
  }

  /** Wyjście z kolejki (w 'proposed' = jak brak akceptu). */
  function leave(gameId: string) {
    lastError.value = null
    gate.call('queue:leave', { gameId })
  }

  /** Akcept propozycji — mecz rusza, gdy zaakceptują OBAJ gracze. */
  function accept(gameId: string, proposalId: string) {
    lastError.value = null
    accepting.value = true
    gate.call('queue:accept', { gameId, proposalId })
  }

  return {
    // stan
    entries,
    mounts,
    started,
    lastError,
    joiningGameId,
    accepting,
    // gettery
    myEntries,
    activeEntry,
    entryFor,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    join,
    leave,
    accept,
  }
})
