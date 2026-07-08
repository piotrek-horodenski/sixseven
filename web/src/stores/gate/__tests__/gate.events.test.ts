import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}))

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
  default: { push: mockPush },
}))

import { useGateStore } from '../gate.store'

function getSocketHandler(name: string) {
  // After connect() is called, socket.on is called with various event names
  const store = useGateStore()
  const calls = store.socket?.on?.mock?.calls || []
  return calls.find((c: any) => c[0] === name)?.[1]
}

describe('gate store socket events', () => {
  let store: ReturnType<typeof useGateStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    store = useGateStore()
    store.connect()
  })

  describe('login-complete', () => {
    it('sets user data and token', () => {
      const handler = getSocketHandler('login-complete')
      handler({ _id: 'u1', username: 'alice', token: 'tok123', permissions: ['a'] })

      expect(store.user).toEqual({ _id: 'u1', username: 'alice', token: 'tok123', permissions: ['a'] })
      expect(store.authToken).toBe('tok123')
      expect(store.isAuthenticated).toBe(true)
    })

    it('clears login error and loading state', () => {
      store.loginError = 'bad password'
      store.loginLoading = true

      const handler = getSocketHandler('login-complete')
      handler({ token: 'tok123' })

      expect(store.loginError).toBeNull()
      expect(store.loginLoading).toBe(false)
    })

    it('navigates to home', () => {
      const handler = getSocketHandler('login-complete')
      handler({ token: 'tok123' })

      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  describe('login-stopped', () => {
    it('sets error message and stops loading', () => {
      store.loginLoading = true

      const handler = getSocketHandler('login-stopped')
      handler({ message: 'Invalid credentials' })

      expect(store.loginError).toBe('Invalid credentials')
      expect(store.loginLoading).toBe(false)
    })
  })

  describe('register-complete', () => {
    it('clears error and sets success', () => {
      store.registerError = 'email taken'

      const handler = getSocketHandler('register-complete')
      handler()

      expect(store.registerError).toBeNull()
      expect(store.registerSuccess).toBe(true)
    })
  })

  describe('register-stopped', () => {
    it('sets error and clears success', () => {
      store.registerSuccess = true

      const handler = getSocketHandler('register-stopped')
      handler({ message: 'Email already registered' })

      expect(store.registerError).toBe('Email already registered')
      expect(store.registerSuccess).toBe(false)
    })
  })

  describe('logout-complete', () => {
    it('resets user and navigates to login when matching _id', () => {
      store.authenticate({ _id: 'u1' }, 'tok123')

      const handler = getSocketHandler('logout-complete')
      handler({ _id: 'u1' })

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(mockPush).toHaveBeenCalledWith('/login')
    })

    it('does nothing when _id does not match', () => {
      store.authenticate({ _id: 'u1' }, 'tok123')

      const handler = getSocketHandler('logout-complete')
      handler({ _id: 'other-user' })

      expect(store.isAuthenticated).toBe(true)
      expect(store.user._id).toBe('u1')
    })
  })

  describe('session', () => {
    it('restores user from session event', () => {
      const handler = getSocketHandler('session')
      handler({ _id: 'u1', username: 'alice', permissions: ['manage-users'] })

      expect(store.user).toEqual({ _id: 'u1', username: 'alice', permissions: ['manage-users'] })
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('connect/disconnect', () => {
    it('sets connected=true on connect', () => {
      const handler = getSocketHandler('connect')
      handler()
      expect(store.connected).toBe(true)
    })

    it('sets connected=false on disconnect', () => {
      store.connected = true
      const handler = getSocketHandler('disconnect')
      handler()
      expect(store.connected).toBe(false)
    })
  })
})
