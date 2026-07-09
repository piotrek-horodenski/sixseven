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
import { useAdminStore } from '@/stores/admin/admin.store'

function setupStores() {
  const gate = useGateStore()
  const admin = useAdminStore()

  gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-settings', 'manage-users', 'manage-roles'] }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'

  gate.connect()
  simulator.connect()

  admin.init()

  return { gate, admin }
}

describe('admin settings integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('initializes settings from collection-init', () => {
    const { admin } = setupStores()

    simulator.simulate('collection-init', 'settings', [
      { _id: 's1', name: 'register', display: 'Allow Registration', type: 'boolean', value: true },
      { _id: 's2', name: 'admin-first', display: 'Admin First', type: 'boolean', value: false },
    ])

    expect(admin.settings).toHaveLength(2)
    expect(admin.settings[0].name).toBe('register')
    expect(admin.settings[1].value).toBe(false)
  })

  it('updates a setting and receives the update via collection-update', () => {
    const { admin } = setupStores()

    simulator.simulate('collection-init', 'settings', [
      { _id: 's1', name: 'register', display: 'Allow Registration', type: 'boolean', value: true },
    ])

    admin.updateSetting('s1', false)

    const emitted = simulator.getEmitted('admin:settings:update')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ _id: 's1', value: false })

    // Simulate server response
    simulator.simulate('collection-update', 'settings', {
      _id: 's1', name: 'register', display: 'Allow Registration', type: 'boolean', value: false,
    })

    expect(admin.settings[0].value).toBe(false)
  })

  it('creates a setting and receives it via collection-add', () => {
    const { admin } = setupStores()

    simulator.simulate('collection-init', 'settings', [])

    admin.createSetting({ name: 'timeout', display: 'Session Timeout', type: 'number', value: 30 })

    const emitted = simulator.getEmitted('admin:settings:create')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({
      name: 'timeout', display: 'Session Timeout', type: 'number', value: 30,
    })

    simulator.simulate('collection-add', 'settings', {
      _id: 's-new', name: 'timeout', display: 'Session Timeout', type: 'number', value: 30,
    })

    expect(admin.settings).toHaveLength(1)
    expect(admin.settings[0].name).toBe('timeout')
  })

  it('deletes a setting and receives removal via collection-delete', () => {
    const { admin } = setupStores()

    simulator.simulate('collection-init', 'settings', [
      { _id: 's1', name: 'register', display: 'Allow Registration', type: 'boolean', value: true },
      { _id: 's2', name: 'timeout', display: 'Timeout', type: 'number', value: 30 },
    ])

    admin.deleteSetting('s2')

    const emitted = simulator.getEmitted('admin:settings:delete')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ _id: 's2' })

    simulator.simulate('collection-delete', 'settings', 's2')

    expect(admin.settings).toHaveLength(1)
    expect(admin.settings[0]._id).toBe('s1')
  })

  it('subscribes to settings collection on init', () => {
    setupStores()

    const emitted = simulator.getEmitted('subscribe')
    expect(emitted.length).toBeGreaterThanOrEqual(1)

    const tickets = emitted[0][0].tickets
    const settingsTicket = tickets.find((t: any) => t.collection === 'settings')
    expect(settingsTicket).toBeDefined()
  })

  it('cleanup unsubscribes and clears state', () => {
    const { admin } = setupStores()

    simulator.simulate('collection-init', 'settings', [
      { _id: 's1', name: 'register', type: 'boolean', value: true },
    ])
    expect(admin.settings).toHaveLength(1)

    admin.cleanup()

    expect(admin.settings).toHaveLength(0)
    expect(admin.subscribed).toBe(false)

    const unsubEmitted = simulator.getEmitted('unsubscribe')
    expect(unsubEmitted.length).toBeGreaterThanOrEqual(1)
  })
})
