import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    user: { _id: 'me', permissions: [] },
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import { useRoomsStore } from '../rooms.store'

/** Symuluje broadcast serwera: każdy zarejestrowany handler eventu dostaje dane. */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}
function ack(event: string, payload: any) {
  const handler = mockOn.mock.calls.find((c: any) => c[0] === event)?.[1]
  handler?.(payload)
}

function member(id: string, kind: 'user' | 'guest' = 'user', nick = id) {
  return { id, kind, nick }
}

describe('rooms store', () => {
  let store: ReturnType<typeof useRoomsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useRoomsStore()
    store.init()
  })

  describe('subskrypcja', () => {
    it('subskrybuje kolekcję rooms', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'rooms', filter: {} }],
      })
    })

    it('rejestruje handlery acków', () => {
      expect(mockOn).toHaveBeenCalledWith('rooms:create-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('rooms:join-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('games:handoff-complete', expect.any(Function))
    })

    it('init jest idempotentny (drugie wejście tylko podbija refcount)', () => {
      const before = mockCall.mock.calls.length
      store.init()
      expect(mockCall.mock.calls.length).toBe(before)
      expect(store.mounts).toBe(2)
    })

    it('cleanup nie odsubskrybuje dopóki są aktywne widoki (refcount)', () => {
      store.init() // mounts = 2
      store.cleanup() // mounts = 1 → nadal aktywny
      expect(mockCall).not.toHaveBeenCalledWith('unsubscribe', { collections: ['rooms'] })
      store.cleanup() // mounts = 0 → stop
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['rooms'] })
    })
  })

  describe('komendy', () => {
    it('createRoom wysyła gameId + name + visibility i ustawia creating', () => {
      store.createRoom('Wieczorne RPS', 'public')
      expect(mockCall).toHaveBeenCalledWith('rooms:create', {
        gameId: 'rps',
        name: 'Wieczorne RPS',
        visibility: 'public',
      })
      expect(store.creating).toBe(true)
    })

    it('join / leave / requestHandoff wołają właściwe eventy', () => {
      store.join('ABC234')
      store.leave('room1')
      store.requestHandoff('match1')
      expect(mockCall).toHaveBeenCalledWith('rooms:join', { code: 'ABC234' })
      expect(mockCall).toHaveBeenCalledWith('rooms:leave', { roomId: 'room1' })
      expect(mockCall).toHaveBeenCalledWith('games:request-handoff', { matchId: 'match1' })
    })

    it('enterGame woła od razu request-handoff', () => {
      store.enterGame('match9')
      expect(mockCall).toHaveBeenCalledWith('games:request-handoff', { matchId: 'match9' })
    })

    it('createAndPlay: po create-complete z matchId sam woła request-handoff', () => {
      store.createAndPlay('Gra x', 'public')
      expect(mockCall).toHaveBeenCalledWith('rooms:create', {
        gameId: 'rps',
        name: 'Gra x',
        visibility: 'public',
      })
      ack('rooms:create-complete', { roomId: 'r1', code: 'ABC234', matchId: 'm1' })
      expect(store.lastCreatedMatchId).toBe('m1')
      expect(mockCall).toHaveBeenCalledWith('games:request-handoff', { matchId: 'm1' })
    })

    it('joinAndPlay: po join-complete z matchId sam woła request-handoff', () => {
      store.joinAndPlay('ABC234')
      expect(mockCall).toHaveBeenCalledWith('rooms:join', { code: 'ABC234' })
      ack('rooms:join-complete', { roomId: 'r9', matchId: 'm2' })
      expect(store.lastJoinedMatchId).toBe('m2')
      expect(mockCall).toHaveBeenCalledWith('games:request-handoff', { matchId: 'm2' })
    })

    it('zwykłe createRoom/join (bez *AndPlay) NIE odpalają automatycznego handoffu', () => {
      store.createRoom('Gra y', 'public')
      ack('rooms:create-complete', { roomId: 'r2', code: 'DEF456', matchId: 'm3' })
      expect(mockCall).not.toHaveBeenCalledWith('games:request-handoff', { matchId: 'm3' })
    })
  })

  describe('acki', () => {
    it('create-complete ustawia roomId + code + matchId i gasi creating', () => {
      store.createRoom('x', 'private')
      ack('rooms:create-complete', { roomId: 'r1', code: 'ABC234', matchId: 'm1' })
      expect(store.lastCreatedRoomId).toBe('r1')
      expect(store.lastCreatedCode).toBe('ABC234')
      expect(store.lastCreatedMatchId).toBe('m1')
      expect(store.creating).toBe(false)
    })

    it('create-error ustawia błąd', () => {
      store.createRoom('x', 'private')
      ack('rooms:create-error', { message: 'boom' })
      expect(store.lastError).toBe('boom')
      expect(store.creating).toBe(false)
    })

    it('join-complete ustawia lastJoinedRoomId + lastJoinedMatchId', () => {
      ack('rooms:join-complete', { roomId: 'r9', matchId: 'm9' })
      expect(store.lastJoinedRoomId).toBe('r9')
      expect(store.lastJoinedMatchId).toBe('m9')
    })

    it('handoff-complete zapamiętuje kod handoffu', () => {
      ack('games:handoff-complete', { code: 'HND123', gameId: 'rps', playerId: 'me' })
      expect(store.lastHandoff).toEqual({ code: 'HND123', gameId: 'rps', playerId: 'me' })
    })
  })

  describe('gettery', () => {
    beforeEach(() => {
      fireAll('collection-init', 'rooms', [
        {
          _id: 'r1',
          code: 'AAA111',
          gameId: 'rps',
          name: 'Mój otwarty',
          hostId: 'me',
          hostKind: 'user',
          visibility: 'public',
          status: 'open',
          members: [member('me')],
          matchId: null,
          updatedAt: 3,
        },
        {
          _id: 'r2',
          code: 'BBB222',
          gameId: 'rps',
          name: 'Cudzy publiczny',
          hostId: 'bob',
          hostKind: 'user',
          visibility: 'public',
          status: 'open',
          members: [member('bob')],
          matchId: null,
          updatedAt: 2,
        },
        {
          _id: 'r3',
          code: 'CCC333',
          gameId: 'rps',
          name: 'Cudzy zamknięty',
          hostId: 'ann',
          hostKind: 'user',
          visibility: 'public',
          status: 'closed',
          members: [member('ann')],
          matchId: null,
          updatedAt: 1,
        },
      ])
    })

    it('publicOpenRooms: publiczne + otwarte + nie moje', () => {
      expect(store.publicOpenRooms.map((r) => r._id)).toEqual(['r2'])
    })

    it('myRooms: te, w których jestem członkiem', () => {
      expect(store.myRooms.map((r) => r._id)).toEqual(['r1'])
    })

    it('roomById zwraca właściwy pokój', () => {
      expect(store.roomById('r2')?.name).toBe('Cudzy publiczny')
    })

    it('isHost rozpoznaje hosta = bieżący user', () => {
      expect(store.isHost(store.roomById('r1'))).toBe(true)
      expect(store.isHost(store.roomById('r2'))).toBe(false)
    })
  })
})
