import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection } from '@/composables/useCollection'
import type {
  Friendship,
  Presence,
  Friend,
  PendingInvite,
  FriendPresence,
} from './social.model'

/**
 * Store społecznościowy (Etap 4a — znajomi + obecność). Dwa źródła prawdy,
 * oba subskrybowane przez `useCollection` (row-level, gate filtruje):
 *  - `friendships` — relacje (invited/accepted),
 *  - `presence`    — status obecności znajomych (widoczny tylko znajomym).
 *
 * Komendy (`friends:invite/accept/remove`, `presence:set-invisible`) idą
 * socketem usera do gate; wynik przychodzi ackiem (`*-complete` / `*-error`)
 * używanym wyłącznie do UX (błąd), a stan relacji/obecności aktualizuje osobno
 * subskrypcja. Wzorzec 1:1 jak `stores/rooms/rooms.store.ts`.
 *
 * Cykl życia liczymy referencyjnie (`mounts`), bo panel znajomych (aside) i
 * przełącznik prywatności (Preferencje) mogą być zamontowane naraz — nakładające
 * się mount/unmount nie może ubić subskrypcji.
 */
export const useSocialStore = defineStore('social', () => {
  const gate = useGateStore()

  const friendshipsCol = useCollection<Friendship>('friendships')
  const presenceCol = useCollection<Presence>('presence')

  const friendships = friendshipsCol.docs
  const presences = presenceCol.docs

  const mounts = ref(0)
  const started = ref(false)
  const lastError = ref<string | null>(null)
  /** Tryb niewidzialny (pref usera) — seed z `gate.user`, potwierdzany ackiem. */
  const invisible = ref(false)

  const currentUserId = computed<string | null>(() => gate.user?._id ?? null)

  /** Druga strona relacji względem bieżącego usera (para jest znormalizowana). */
  function otherId(f: Friendship): string {
    return f.a === currentUserId.value ? f.b : f.a
  }

  /** Nazwa drugiej strony do wyświetlenia (denormalizowany username; fallback = id). */
  function otherNick(f: Friendship): string {
    const id = otherId(f)
    return f.nicks?.[id] ?? id
  }

  function isParty(f: Friendship): boolean {
    return f.a === currentUserId.value || f.b === currentUserId.value
  }

  function presenceFor(userId: string): Presence | undefined {
    return presences.value.find((p) => p.userId === userId)
  }

  // ---- gettery ----------------------------------------------------------

  /** Zaakceptowani znajomi + ich status obecności (offline, gdy brak presence). */
  const friends = computed<Friend[]>(() =>
    friendships.value
      .filter((f) => f.status === 'accepted' && isParty(f))
      .map((f) => {
        const userId = otherId(f)
        const p = presenceFor(userId)
        return {
          userId,
          nick: otherNick(f),
          friendshipId: f._id,
          status: (p?.status ?? 'offline') as FriendPresence,
          currentMatchId: p?.currentMatchId ?? null,
        }
      })
      .sort((x, y) => x.nick.localeCompare(y.nick)),
  )

  /** Zaproszenia do mnie (ktoś inny zaprosił, ja jestem stroną). */
  const pendingIncoming = computed<PendingInvite[]>(() =>
    friendships.value
      .filter(
        (f) =>
          f.status === 'invited' && isParty(f) && f.invitedBy !== currentUserId.value,
      )
      .map((f) => ({ userId: otherId(f), nick: otherNick(f), friendshipId: f._id, invitedBy: f.invitedBy })),
  )

  /** Zaproszenia wysłane przeze mnie (oczekujące). */
  const pendingOutgoing = computed<PendingInvite[]>(() =>
    friendships.value
      .filter((f) => f.status === 'invited' && f.invitedBy === currentUserId.value)
      .map((f) => ({ userId: otherId(f), nick: otherNick(f), friendshipId: f._id, invitedBy: f.invitedBy })),
  )

  // ---- acki (UX) --------------------------------------------------------

  function onInviteComplete(_payload: { userId: string }) {
    lastError.value = null
  }
  function onInviteError({ message }: { message?: string }) {
    lastError.value = message || t('social.errors.invite')
  }
  function onAcceptComplete(_payload: { userId: string }) {
    lastError.value = null
  }
  function onAcceptError({ message }: { message?: string }) {
    lastError.value = message || t('social.errors.accept')
  }
  function onRemoveComplete(_payload: { userId: string }) {
    lastError.value = null
  }
  function onRemoveError({ message }: { message?: string }) {
    lastError.value = message || t('social.errors.remove')
  }
  function onSetInvisibleComplete({ invisible: value }: { invisible: boolean }) {
    invisible.value = !!value
    lastError.value = null
  }
  function onSetInvisibleError({ message }: { message?: string }) {
    lastError.value = message || t('social.errors.privacy')
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['friends:invite-complete', onInviteComplete],
    ['friends:invite-error', onInviteError],
    ['friends:accept-complete', onAcceptComplete],
    ['friends:accept-error', onAcceptError],
    ['friends:remove-complete', onRemoveComplete],
    ['friends:remove-error', onRemoveError],
    ['presence:set-invisible-complete', onSetInvisibleComplete],
    ['presence:set-invisible-error', onSetInvisibleError],
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

  // ---- cykl życia (refcount) -------------------------------------------

  function init() {
    mounts.value += 1
    if (started.value) return
    started.value = true
    invisible.value = !!gate.user?.privacy?.invisible
    registerAcks()
    gate.onReconnect(registerAcks)
    friendshipsCol.start()
    presenceCol.start()
  }

  function cleanup() {
    if (mounts.value > 0) mounts.value -= 1
    if (mounts.value > 0 || !started.value) return
    friendshipsCol.stop()
    presenceCol.stop()
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    started.value = false
  }

  // ---- komendy ----------------------------------------------------------

  function clearError() {
    lastError.value = null
  }

  /** Zaproś po userId (nazwa/ID rozstrzyga gate — my przekazujemy wpisaną wartość). */
  function invite(userId: string) {
    lastError.value = null
    gate.call('friends:invite', { userId })
  }

  function accept(userId: string) {
    lastError.value = null
    gate.call('friends:accept', { userId })
  }

  /** Usuwa relację — działa i dla accepted, i dla invited (odrzucenie zaproszenia). */
  function remove(userId: string) {
    lastError.value = null
    gate.call('friends:remove', { userId })
  }

  /** Ustawia tryb niewidzialny (optymistycznie; ack potwierdza wartość gate). */
  function setInvisible(value: boolean) {
    lastError.value = null
    invisible.value = value
    gate.call('presence:set-invisible', { invisible: value })
  }

  return {
    // stan
    friendships,
    presences,
    started,
    mounts,
    lastError,
    invisible,
    currentUserId,
    // gettery
    friends,
    pendingIncoming,
    pendingOutgoing,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    invite,
    accept,
    remove,
    setInvisible,
  }
})
