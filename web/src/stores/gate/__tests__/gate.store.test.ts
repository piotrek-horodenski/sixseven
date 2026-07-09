import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

import { useGateStore } from '../gate.store'

describe('gate store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('authenticate', () => {
    it('sets user, token, and isAuthenticated', () => {
      const store = useGateStore()
      store.authenticate({ name: 'admin', permissions: ['a'] }, 'tok123')

      expect(store.user).toEqual({ name: 'admin', permissions: ['a'] })
      expect(store.authToken).toBe('tok123')
      expect(store.isAuthenticated).toBe(true)
    })

    it('persists token to localStorage', () => {
      const store = useGateStore()
      store.authenticate({ name: 'admin' }, 'tok123')

      expect(localStorage.getItem('hydra_token')).toBe('tok123')
    })
  })

  describe('resetUser', () => {
    it('clears user state and localStorage', () => {
      const store = useGateStore()
      store.authenticate({ name: 'admin' }, 'tok123')
      store.resetUser()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.authToken).toBeNull()
      expect(localStorage.getItem('hydra_token')).toBeNull()
    })
  })

  describe('call', () => {
    it('does nothing when socket is null', () => {
      const store = useGateStore()
      // Should not throw
      store.call('test', {})
    })

    it('emits directly when socket is connected', () => {
      const store = useGateStore()
      store.connect()
      store.socket.connected = true

      store.call('test-event', { data: 1 })

      expect(store.socket.emit).toHaveBeenCalledWith('test-event', { data: 1 })
    })

    it('queues emit for when socket connects', () => {
      const store = useGateStore()
      store.connect()
      store.socket.connected = false

      store.call('test-event', { data: 1 })

      expect(store.socket.once).toHaveBeenCalledWith('connect', expect.any(Function))
    })
  })

  describe('reconnect callbacks', () => {
    it('registers and removes callbacks', () => {
      const store = useGateStore()
      const cb = vi.fn()

      store.onReconnect(cb)
      store.offReconnect(cb)
      // No way to directly test removal without triggering connect,
      // but it should not throw
    })
  })

  describe('disconnect', () => {
    it('does nothing when socket not connected', () => {
      const store = useGateStore()
      store.connect()
      store.socket.connected = false

      store.disconnect()
      expect(store.socket.disconnect).not.toHaveBeenCalled()
    })

    it('disconnects when socket is connected', () => {
      const store = useGateStore()
      store.connect()
      store.socket.connected = true

      store.disconnect()
      expect(store.socket.disconnect).toHaveBeenCalled()
    })
  })
})
