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

import { useChatStore } from '../chat.store'

/** Symuluje broadcast serwera: każdy zarejestrowany handler eventu dostaje dane. */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}
function ack(event: string, payload: any) {
  const handler = mockOn.mock.calls.find((c: any) => c[0] === event)?.[1]
  handler?.(payload)
}

function msg(id: string, ts: number, over: Record<string, unknown> = {}) {
  return {
    _id: id,
    scope: 'room',
    scopeId: 'r1',
    authorId: 'bob',
    authorNick: 'Bob',
    text: `msg ${id}`,
    ts,
    ...over,
  }
}

describe('chat store', () => {
  let store: ReturnType<typeof useChatStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useChatStore()
    store.init('room', 'r1')
  })

  describe('subskrypcja', () => {
    it('subskrybuje kolekcję messages z filtrem scope+scopeId', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'messages', filter: { scope: 'room', scopeId: 'r1' } }],
      })
    })

    it('rejestruje handlery acków send', () => {
      expect(mockOn).toHaveBeenCalledWith('chat:send-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('chat:send-error', expect.any(Function))
    })

    it('init jest idempotentny dla tego samego zakresu (refcount)', () => {
      const before = mockCall.mock.calls.length
      store.init('room', 'r1')
      expect(mockCall.mock.calls.length).toBe(before)
      expect(store.mounts).toBe(2)
    })

    it('cleanup nie odsubskrybuje dopóki są aktywne widoki (refcount)', () => {
      store.init('room', 'r1') // mounts = 2
      store.cleanup() // mounts = 1
      expect(mockCall).not.toHaveBeenCalledWith('unsubscribe', { collections: ['messages'] })
      store.cleanup() // mounts = 0 → stop
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['messages'] })
    })

    it('init z innym zakresem przełącza subskrypcję', () => {
      store.init('match', 'm9')
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['messages'] })
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'messages', filter: { scope: 'match', scopeId: 'm9' } }],
      })
      expect(store.scope).toBe('match')
      expect(store.scopeId).toBe('m9')
    })
  })

  describe('wiadomości', () => {
    it('collection-init wypełnia listę, sortedMessages rosnąco po czasie', () => {
      fireAll('collection-init', 'messages', [msg('b', 20), msg('a', 10)])
      expect(store.messages).toHaveLength(2)
      expect(store.sortedMessages.map((m) => m._id)).toEqual(['a', 'b'])
    })

    it('collection-add dokłada wiadomość', () => {
      fireAll('collection-init', 'messages', [msg('a', 10)])
      fireAll('collection-add', 'messages', msg('c', 30))
      expect(store.sortedMessages.map((m) => m._id)).toEqual(['a', 'c'])
    })
  })

  describe('send', () => {
    it('wysyła chat:send z bieżącym zakresem i przyciętym tekstem', () => {
      const ok = store.send('  hello  ')
      expect(ok).toBe(true)
      expect(mockCall).toHaveBeenCalledWith('chat:send', {
        scope: 'room',
        scopeId: 'r1',
        text: 'hello',
      })
      expect(store.sending).toBe(true)
    })

    it('nie wysyła pustej wiadomości', () => {
      const ok = store.send('   ')
      expect(ok).toBe(false)
      expect(mockCall).not.toHaveBeenCalledWith('chat:send', expect.anything())
    })

    it('odrzuca zbyt długą wiadomość lokalnie (bez wysyłki)', () => {
      const ok = store.send('x'.repeat(501))
      expect(ok).toBe(false)
      expect(store.lastError).toBeTruthy()
    })
  })

  describe('acki', () => {
    it('send-complete gasi sending i czyści błędy', () => {
      store.send('hi')
      ack('chat:send-complete', { id: 'msg1' })
      expect(store.sending).toBe(false)
      expect(store.lastError).toBeNull()
      expect(store.rateLimited).toBe(false)
    })

    it('send-error rate_limited ustawia flagę rate-limit', () => {
      store.send('hi')
      ack('chat:send-error', { message: 'rate_limited' })
      expect(store.rateLimited).toBe(true)
      expect(store.lastError).toBeTruthy()
      expect(store.sending).toBe(false)
    })

    it('send-error inny błąd ustawia komunikat, bez flagi rate-limit', () => {
      store.send('hi')
      ack('chat:send-error', { message: 'not a member' })
      expect(store.rateLimited).toBe(false)
      expect(store.lastError).toBe('not a member')
    })
  })
})
