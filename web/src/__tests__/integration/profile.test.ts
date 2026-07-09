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

  gate.user = {
    _id: 'u1',
    username: 'testuser',
    permissions: [],
    profile: { display: 'Test User', type: 'regular', status: '' },
  }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'

  gate.connect()
  simulator.connect()

  return { gate }
}

describe('profile update integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('emits profile:update event with display name', () => {
    const { gate } = setupGate()

    gate.call('profile:update', { display: 'New Name' })

    const emitted = simulator.getEmitted('profile:update')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ display: 'New Name' })
  })

  it('receives profile:update-complete via listener', () => {
    const { gate } = setupGate()

    let receivedDisplay = ''
    simulator.socket.on('profile:update-complete', ({ display }: { display: string }) => {
      receivedDisplay = display
    })

    simulator.simulate('profile:update-complete', { display: 'Updated Name' })

    expect(receivedDisplay).toBe('Updated Name')
  })

  it('receives profile:update-stopped with error message', () => {
    setupGate()

    let receivedMessage = ''
    simulator.socket.on('profile:update-stopped', ({ message }: { message: string }) => {
      receivedMessage = message
    })

    simulator.simulate('profile:update-stopped', { message: 'display name is required' })

    expect(receivedMessage).toBe('display name is required')
  })
})

describe('password change integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('emits profile:change-password event', () => {
    const { gate } = setupGate()

    gate.call('profile:change-password', { currentPassword: 'old123', newPassword: 'new123' })

    const emitted = simulator.getEmitted('profile:change-password')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ currentPassword: 'old123', newPassword: 'new123' })
  })

  it('receives profile:change-password-complete', () => {
    setupGate()

    let completed = false
    simulator.socket.on('profile:change-password-complete', () => {
      completed = true
    })

    simulator.simulate('profile:change-password-complete')

    expect(completed).toBe(true)
  })

  it('receives profile:change-password-stopped with error', () => {
    setupGate()

    let receivedMessage = ''
    simulator.socket.on('profile:change-password-stopped', ({ message }: { message: string }) => {
      receivedMessage = message
    })

    simulator.simulate('profile:change-password-stopped', { message: 'current password is incorrect' })

    expect(receivedMessage).toBe('current password is incorrect')
  })
})
