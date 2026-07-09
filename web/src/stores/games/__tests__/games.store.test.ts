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

import { useGamesStore } from '../games.store'

/** Symuluje broadcast serwera: każdy zarejestrowany handler eventu dostaje dane. */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}
function ack(event: string, payload: any) {
  const handler = mockOn.mock.calls.find((c: any) => c[0] === event)?.[1]
  handler?.(payload)
}

describe('games store', () => {
  let store: ReturnType<typeof useGamesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useGamesStore()
    store.init()
  })

  describe('subskrypcja', () => {
    it('subskrybuje matches i match_views', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'matches', filter: {} }],
      })
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'match_views', filter: {} }],
      })
    })

    it('rejestruje handlery acków', () => {
      expect(mockOn).toHaveBeenCalledWith('games:create-match-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('games:submit-move-rejected', expect.any(Function))
    })

    it('init jest idempotentny', () => {
      const before = mockCall.mock.calls.length
      store.init()
      expect(mockCall.mock.calls.length).toBe(before)
    })
  })

  describe('komendy', () => {
    it('createRpsMatch wysyła gameId rps + przeciwnika + target', () => {
      store.createRpsMatch('bob', 3)
      expect(mockCall).toHaveBeenCalledWith('games:create-match', {
        gameId: 'rps',
        players: ['bob'],
        ranked: false,
        options: { target: 3 },
      })
      expect(store.creating).toBe(true)
    })

    it('submitMove przekazuje ruch i kasuje flagę odrzucenia', () => {
      ack('games:submit-move-rejected', { matchId: 'm1' })
      expect(store.rejectedMatchIds.has('m1')).toBe(true)
      store.submitMove('m1', 'rock')
      expect(mockCall).toHaveBeenCalledWith('games:submit-move', { matchId: 'm1', move: 'rock' })
      expect(store.rejectedMatchIds.has('m1')).toBe(false)
    })

    it('start i revealDone wołają właściwe eventy', () => {
      store.start('m1')
      store.revealDone('m1')
      expect(mockCall).toHaveBeenCalledWith('games:start', { matchId: 'm1' })
      expect(mockCall).toHaveBeenCalledWith('games:reveal-done', { matchId: 'm1' })
    })
  })

  describe('acki', () => {
    it('create-match-complete ustawia lastCreatedMatchId i gasi creating', () => {
      store.createRpsMatch('bob')
      ack('games:create-match-complete', { matchId: 'new1' })
      expect(store.lastCreatedMatchId).toBe('new1')
      expect(store.creating).toBe(false)
    })

    it('create-match-error ustawia błąd', () => {
      store.createRpsMatch('bob')
      ack('games:create-match-error', { message: 'boom' })
      expect(store.lastError).toBe('boom')
      expect(store.creating).toBe(false)
    })
  })

  describe('gettery', () => {
    beforeEach(() => {
      fireAll('collection-init', 'matches', [
        { _id: 'm1', gameId: 'rps', players: ['me', 'bob'], phase: 'planning', round: 1, score: { me: 0, bob: 0 }, updatedAt: 2 },
        { _id: 'm2', gameId: 'rps', players: ['me', 'ann'], phase: 'finished', round: 3, score: { me: 2, ann: 1 }, updatedAt: 1 },
      ])
      fireAll('collection-init', 'match_views', [
        { _id: 'v1', matchId: 'm1', playerId: 'me', round: 1, view: { yourMove: 'rock', roundWinner: null, moves: [], scores: {}, target: 2 } },
        { _id: 'v2', matchId: 'm1', playerId: 'me', round: 2, view: { yourMove: 'paper', roundWinner: 'me', moves: [], scores: {}, target: 2 } },
      ])
    })

    it('dzieli mecze na aktywne i zakończone', () => {
      expect(store.activeMatches.map((m) => m._id)).toEqual(['m1'])
      expect(store.finishedMatches.map((m) => m._id)).toEqual(['m2'])
    })

    it('matchById zwraca właściwy mecz', () => {
      expect(store.matchById('m2')?.phase).toBe('finished')
    })

    it('latestView zwraca widok o najwyższej rundzie', () => {
      expect(store.latestView('m1')?._id).toBe('v2')
    })

    it('opponentId zwraca drugiego gracza', () => {
      expect(store.opponentId(store.matchById('m1'))).toBe('bob')
    })
  })
})
