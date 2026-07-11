import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection } from '@/composables/useCollection'
import { RPS_GAME_ID, type Room, type RoomVisibility } from './rooms.model'

/**
 * Store pokoi (Etap 2d). Jedno źródło prawdy: kolekcja `rooms`, subskrybowana
 * przez `useCollection` (row-level: gate oddaje publiczne otwarte + własne).
 *
 * Komendy (`rooms:create/join/leave/start`) i `games:request-handoff` idą
 * socketem usera do gate; wynik przychodzi ackiem (`*-complete` / `*-error`)
 * używanym wyłącznie do UX (nawigacja, błąd), a stan pokoju aktualizuje osobno
 * subskrypcja. Wzorzec 1:1 jak `stores/games/games.store.ts`.
 *
 * Cykl życia liczymy referencyjnie (`mounts`), bo init/cleanup wołają DWA
 * widoki (RoomsView i RoomDetail) — nakładające się mount/unmount przy nawigacji
 * nie może ubić subskrypcji. AppLayout jest współdzielony, więc nie inicjujemy
 * tam (inaczej niż games w 2c).
 */
export const useRoomsStore = defineStore('rooms', () => {
  const gate = useGateStore()

  const roomsCol = useCollection<Room>('rooms')
  const rooms = roomsCol.docs

  const mounts = ref(0)
  const started = ref(false)
  const lastError = ref<string | null>(null)
  const creating = ref(false)
  const lastCreatedRoomId = ref<string | null>(null)
  const lastCreatedCode = ref<string | null>(null)
  const lastJoinedRoomId = ref<string | null>(null)
  const lastLeftRoomId = ref<string | null>(null)
  const lastStartedMatchId = ref<string | null>(null)
  /** Kod handoffu przechwycony po `games:handoff-complete` — do redirectu na grę. */
  const lastHandoff = ref<{ code: string; gameId: string; playerId: string } | null>(null)

  const currentUserId = computed<string | null>(() => gate.user?._id ?? null)

  function isMember(room: Room): boolean {
    return !!currentUserId.value && room.members?.some((m) => m.id === currentUserId.value)
  }

  function isHost(room: Room | undefined | null): boolean {
    return !!room && !!currentUserId.value && room.hostId === currentUserId.value
  }

  const sortedRooms = computed(() =>
    [...rooms.value].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  )

  /** Publiczne, otwarte pokoje, do których jeszcze nie należę (hub „dołącz"). */
  const publicOpenRooms = computed(() =>
    sortedRooms.value.filter(
      (r) => r.visibility === 'public' && r.status === 'open' && !isMember(r),
    ),
  )

  /** Pokoje, w których jestem członkiem (host lub dołączony) — bez zamkniętych. */
  const myRooms = computed(() =>
    sortedRooms.value.filter((r) => isMember(r) && r.status !== 'closed'),
  )

  function roomById(id: string): Room | undefined {
    return rooms.value.find((r) => r._id === id)
  }

  // ---- acki (UX) --------------------------------------------------------

  function onCreateComplete({ roomId, code }: { roomId: string; code: string }) {
    creating.value = false
    lastError.value = null
    lastCreatedRoomId.value = roomId
    lastCreatedCode.value = code
  }
  function onCreateError({ message }: { message?: string }) {
    creating.value = false
    lastError.value = message || 'Nie udało się utworzyć pokoju'
  }
  function onJoinComplete({ roomId }: { roomId: string }) {
    lastError.value = null
    lastJoinedRoomId.value = roomId
  }
  function onJoinError({ message }: { message?: string }) {
    lastError.value = message || 'Nie udało się dołączyć do pokoju'
  }
  function onLeaveComplete({ roomId }: { roomId: string }) {
    lastLeftRoomId.value = roomId
  }
  function onStartComplete({ matchId }: { matchId: string }) {
    lastError.value = null
    lastStartedMatchId.value = matchId
  }
  function onStartError({ message }: { message?: string }) {
    lastError.value = message || 'Nie udało się wystartować meczu'
  }
  function onHandoffComplete(payload: { code: string; gameId: string; playerId: string }) {
    lastHandoff.value = payload
  }
  function onHandoffError({ message }: { message?: string }) {
    lastError.value = message || 'Nie udało się przejść do meczu'
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['rooms:create-complete', onCreateComplete],
    ['rooms:create-error', onCreateError],
    ['rooms:join-complete', onJoinComplete],
    ['rooms:join-error', onJoinError],
    ['rooms:leave-complete', onLeaveComplete],
    ['rooms:start-complete', onStartComplete],
    ['rooms:start-error', onStartError],
    ['games:handoff-complete', onHandoffComplete],
    ['games:handoff-error', onHandoffError],
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
    registerAcks()
    gate.onReconnect(registerAcks)
    roomsCol.start()
  }

  function cleanup() {
    if (mounts.value > 0) mounts.value -= 1
    if (mounts.value > 0 || !started.value) return
    roomsCol.stop()
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    started.value = false
  }

  // ---- komendy ----------------------------------------------------------

  function clearError() {
    lastError.value = null
  }

  function createRoom(name: string, visibility: RoomVisibility, gameId = RPS_GAME_ID) {
    lastError.value = null
    lastCreatedRoomId.value = null
    lastCreatedCode.value = null
    creating.value = true
    gate.call('rooms:create', { gameId, name, visibility })
  }

  function join(code: string) {
    lastError.value = null
    lastJoinedRoomId.value = null
    gate.call('rooms:join', { code })
  }

  function leave(roomId: string) {
    lastError.value = null
    gate.call('rooms:leave', { roomId })
  }

  function start(roomId: string) {
    lastError.value = null
    lastStartedMatchId.value = null
    gate.call('rooms:start', { roomId })
  }

  function requestHandoff(matchId: string) {
    lastError.value = null
    lastHandoff.value = null
    gate.call('games:request-handoff', { matchId })
  }

  return {
    // stan
    rooms,
    started,
    mounts,
    lastError,
    creating,
    lastCreatedRoomId,
    lastCreatedCode,
    lastJoinedRoomId,
    lastLeftRoomId,
    lastStartedMatchId,
    lastHandoff,
    currentUserId,
    // gettery
    publicOpenRooms,
    myRooms,
    roomById,
    isHost,
    isMember,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    createRoom,
    join,
    leave,
    start,
    requestHandoff,
  }
})
