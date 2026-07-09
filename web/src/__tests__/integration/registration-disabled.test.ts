import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { socketRef } = vi.hoisted(() => {
  const socketRef: { current: any } = { current: null }
  return { socketRef }
})

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketRef.current),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

import { SocketSimulator } from '../helpers/socket-simulator'

let simulator: SocketSimulator

import { useGateStore } from '@/stores/gate/gate.store'

function setupGate() {
  const gate = useGateStore()
  gate.connect()
  simulator.connect()
  return { gate }
}

describe('registration disabled flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('register-stopped sets registerError on gate store', () => {
    const { gate } = setupGate()

    expect(gate.registerError).toBeNull()
    expect(gate.registerSuccess).toBe(false)

    simulator.simulate('register-stopped', { message: 'registration is disabled' })

    expect(gate.registerError).toBe('registration is disabled')
    expect(gate.registerSuccess).toBe(false)
  })

  it('register-complete sets registerSuccess on gate store', () => {
    const { gate } = setupGate()

    simulator.simulate('register-complete')

    expect(gate.registerSuccess).toBe(true)
    expect(gate.registerError).toBeNull()
  })

  it('register-stopped clears previous success state', () => {
    const { gate } = setupGate()

    // First: successful registration
    simulator.simulate('register-complete')
    expect(gate.registerSuccess).toBe(true)

    // Second: failed registration
    simulator.simulate('register-stopped', { message: 'registration is disabled' })
    expect(gate.registerSuccess).toBe(false)
    expect(gate.registerError).toBe('registration is disabled')
  })

  it('register-complete clears previous error state', () => {
    const { gate } = setupGate()

    // First: failed
    simulator.simulate('register-stopped', { message: 'registration is disabled' })
    expect(gate.registerError).toBe('registration is disabled')

    // Second: success
    simulator.simulate('register-complete')
    expect(gate.registerError).toBeNull()
    expect(gate.registerSuccess).toBe(true)
  })

  it('login-stopped sets loginError on gate store', () => {
    const { gate } = setupGate()

    expect(gate.loginError).toBeNull()

    simulator.simulate('login-stopped', { message: 'invalid credentials' })

    expect(gate.loginError).toBe('invalid credentials')
    expect(gate.loginLoading).toBe(false)
  })

  it('login-complete clears error and authenticates user', () => {
    const { gate } = setupGate()

    // First set an error
    simulator.simulate('login-stopped', { message: 'wrong password' })
    expect(gate.loginError).toBe('wrong password')

    // Then successful login — this triggers a reconnect so we need a new simulator ref
    // Instead, test that login-complete handler sets the right state
    simulator.simulate('login-complete', {
      _id: 'u1',
      username: 'alice',
      token: 'jwt-token-123',
      permissions: ['manage-engines'],
    })

    expect(gate.loginError).toBeNull()
    expect(gate.loginLoading).toBe(false)
    expect(gate.isAuthenticated).toBe(true)
    expect(gate.authToken).toBe('jwt-token-123')
  })

  it('session event restores user data', () => {
    const { gate } = setupGate()

    expect(gate.user).toBeNull()

    simulator.simulate('session', {
      _id: 'u1',
      username: 'alice',
      permissions: ['manage-engines'],
    })

    expect(gate.isAuthenticated).toBe(true)
    expect(gate.user.username).toBe('alice')
  })

  it('logout-complete resets user when _id matches', () => {
    const { gate } = setupGate()

    gate.user = { _id: 'u1', username: 'alice' }
    gate.isAuthenticated = true

    simulator.simulate('logout-complete', { _id: 'u1' })

    expect(gate.user).toBeNull()
    expect(gate.isAuthenticated).toBe(false)
  })

  it('logout-complete does not reset user when _id does not match', () => {
    const { gate } = setupGate()

    gate.user = { _id: 'u1', username: 'alice' }
    gate.isAuthenticated = true

    simulator.simulate('logout-complete', { _id: 'other-user' })

    expect(gate.user).not.toBeNull()
    expect(gate.isAuthenticated).toBe(true)
  })
})
