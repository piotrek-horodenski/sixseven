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

import { useSocialStore } from '../social.store'

/** Symuluje broadcast serwera: każdy zarejestrowany handler eventu dostaje dane. */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}
function ack(event: string, payload: any) {
  const handler = mockOn.mock.calls.find((c: any) => c[0] === event)?.[1]
  handler?.(payload)
}

/** Para znormalizowana (a<b leksykalnie), jak zapisuje gate. */
function friendship(x: string, y: string, status: 'invited' | 'accepted', invitedBy: string, id = `${x}_${y}`) {
  const [a, b] = x < y ? [x, y] : [y, x]
  return { _id: id, a, b, status, invitedBy }
}
function presence(userId: string, status: 'online' | 'lobby' | 'match', currentMatchId: string | null = null) {
  return { _id: `p_${userId}`, userId, status, currentMatchId, visibleTo: ['me'] }
}

describe('social store', () => {
  let store: ReturnType<typeof useSocialStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useSocialStore()
    store.init()
  })

  describe('subskrypcja', () => {
    it('subskrybuje kolekcje friendships i presence', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'friendships', filter: {} }],
      })
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'presence', filter: {} }],
      })
    })

    it('rejestruje handlery acków', () => {
      expect(mockOn).toHaveBeenCalledWith('friends:invite-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('friends:accept-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('presence:set-invisible-complete', expect.any(Function))
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
      expect(mockCall).not.toHaveBeenCalledWith('unsubscribe', { collections: ['friendships'] })
      store.cleanup() // mounts = 0 → stop
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['friendships'] })
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['presence'] })
    })
  })

  describe('komendy', () => {
    it('invite / accept / remove wołają właściwe eventy z userId', () => {
      store.invite('bob')
      store.accept('ann')
      store.remove('carol')
      expect(mockCall).toHaveBeenCalledWith('friends:invite', { userId: 'bob' })
      expect(mockCall).toHaveBeenCalledWith('friends:accept', { userId: 'ann' })
      expect(mockCall).toHaveBeenCalledWith('friends:remove', { userId: 'carol' })
    })

    it('setInvisible wysyła presence:set-invisible i ustawia optymistycznie', () => {
      store.setInvisible(true)
      expect(mockCall).toHaveBeenCalledWith('presence:set-invisible', { invisible: true })
      expect(store.invisible).toBe(true)
    })
  })

  describe('acki', () => {
    it('invite-error ustawia błąd', () => {
      store.invite('bob')
      ack('friends:invite-error', { message: 'już zaproszony' })
      expect(store.lastError).toBe('już zaproszony')
    })

    it('invite-complete czyści błąd', () => {
      store.invite('bob')
      ack('friends:invite-error', { message: 'boom' })
      ack('friends:invite-complete', { userId: 'bob' })
      expect(store.lastError).toBeNull()
    })

    it('accept-complete czyści błąd', () => {
      ack('friends:accept-error', { message: 'boom' })
      ack('friends:accept-complete', { userId: 'ann' })
      expect(store.lastError).toBeNull()
    })

    it('set-invisible-complete potwierdza wartość z gate', () => {
      ack('presence:set-invisible-complete', { invisible: true })
      expect(store.invisible).toBe(true)
      ack('presence:set-invisible-complete', { invisible: false })
      expect(store.invisible).toBe(false)
    })
  })

  describe('gettery', () => {
    beforeEach(() => {
      fireAll('collection-init', 'friendships', [
        friendship('me', 'bob', 'accepted', 'me', 'f_bob'),
        friendship('me', 'ann', 'accepted', 'ann', 'f_ann'),
        friendship('me', 'carol', 'invited', 'carol', 'f_carol'), // ktoś zaprosił mnie
        friendship('me', 'dave', 'invited', 'me', 'f_dave'), // ja zaprosiłem
      ])
      fireAll('collection-init', 'presence', [
        presence('bob', 'match', 'm1'),
        presence('ann', 'lobby'),
      ])
    })

    it('friends: zaakceptowani + status obecności (offline gdy brak presence)', () => {
      const byId = Object.fromEntries(store.friends.map((f) => [f.userId, f]))
      expect(Object.keys(byId).sort()).toEqual(['ann', 'bob'])
      expect(byId.bob.status).toBe('match')
      expect(byId.bob.currentMatchId).toBe('m1')
      expect(byId.ann.status).toBe('lobby')
    })

    it('pendingIncoming: zaproszenia do mnie (invitedBy != ja)', () => {
      expect(store.pendingIncoming.map((i) => i.userId)).toEqual(['carol'])
    })

    it('pendingOutgoing: zaproszenia wysłane przeze mnie', () => {
      expect(store.pendingOutgoing.map((i) => i.userId)).toEqual(['dave'])
    })

    it('presence przez subskrypcję aktualizuje status znajomego', () => {
      fireAll('collection-update', 'presence', presence('ann', 'online'))
      const ann = store.friends.find((f) => f.userId === 'ann')
      expect(ann?.status).toBe('online')
    })
  })
})
