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
import { useEnginesStore } from '@/stores/engines/engines.store'
import { useAdminStore } from '@/stores/admin/admin.store'
import { useColorPresetsStore } from '@/stores/color-presets/color-presets.store'
import type { IEngine } from '@/stores/engines/engines.model'

function makeEngine(overrides: Partial<IEngine>): IEngine {
  return {
    _id: 'e1',
    alias: 'Engine-1',
    address: '192.168.1.10',
    port: 7777,
    rePort: 7778,
    cameraNumber: 1,
    status: 1,
    since: Date.now(),
    lastAttempt: Date.now(),
    assignedProject: '',
    assignedProjectId: '',
    initialized: true,
    locked: false,
    ...overrides,
  }
}

describe('disconnect and reconnect integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('gate connected becomes false on disconnect', () => {
    const gate = useGateStore()
    gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-engines'] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()

    expect(gate.connected).toBe(true)

    simulator.connected = false
    simulator.simulate('disconnect')

    expect(gate.connected).toBe(false)
  })

  it('engines store cleanup unsubscribes and clears data', () => {
    const gate = useGateStore()
    const engines = useEnginesStore()

    gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-engines'] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()
    engines.init()

    simulator.simulate('collection-init', 'engines', [
      makeEngine({ _id: 'e1' }),
      makeEngine({ _id: 'e2', alias: 'Engine-2' }),
    ])
    expect(engines.engines).toHaveLength(2)

    engines.cleanup()

    expect(engines.engines).toHaveLength(0)
    expect(engines.clusters).toHaveLength(0)
    expect(engines.subscribed).toBe(false)

    const unsubEmitted = simulator.getEmitted('unsubscribe')
    expect(unsubEmitted.length).toBeGreaterThanOrEqual(1)
  })

  it('reconnect triggers re-subscription for engines store', () => {
    const gate = useGateStore()
    const engines = useEnginesStore()

    gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-engines'] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()
    engines.init()

    simulator.simulate('collection-init', 'engines', [makeEngine({ _id: 'e1' })])
    simulator.simulate('collection-init', 'clusters', [])

    simulator.clearEmitted()

    // Simulate reconnect
    simulator.simulate('connect')

    const subscribeEmissions = simulator.getEmitted('subscribe')
    expect(subscribeEmissions.length).toBeGreaterThanOrEqual(1)

    const hasEnginesTicket = subscribeEmissions.some((args: any[]) =>
      args[0].tickets.some((t: any) => t.collection === 'engines'),
    )
    expect(hasEnginesTicket).toBe(true)
  })

  it('reconnect triggers re-subscription for color presets store', () => {
    const gate = useGateStore()
    const colorPresets = useColorPresetsStore()

    gate.user = { _id: 'u1', username: 'testuser', permissions: [] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()
    colorPresets.init()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
    ])

    simulator.clearEmitted()

    // Simulate reconnect
    simulator.simulate('connect')

    const subscribeEmissions = simulator.getEmitted('subscribe')
    expect(subscribeEmissions.length).toBeGreaterThanOrEqual(1)

    const hasColorPresetsTicket = subscribeEmissions.some((args: any[]) =>
      args[0].tickets.some((t: any) => t.collection === 'color-presets'),
    )
    expect(hasColorPresetsTicket).toBe(true)
  })

  it('reconnect triggers re-subscription for admin store', () => {
    const gate = useGateStore()
    const admin = useAdminStore()

    gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-users', 'manage-roles', 'manage-settings'] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()
    admin.init()

    simulator.simulate('collection-init', 'settings', [
      { _id: 's1', name: 'register', value: true },
    ])

    simulator.clearEmitted()

    // Simulate reconnect
    simulator.simulate('connect')

    const subscribeEmissions = simulator.getEmitted('subscribe')
    expect(subscribeEmissions.length).toBeGreaterThanOrEqual(1)

    const hasSettingsTicket = subscribeEmissions.some((args: any[]) =>
      args[0].tickets.some((t: any) => t.collection === 'settings'),
    )
    expect(hasSettingsTicket).toBe(true)
  })

  it('gate.call queues emission when socket is not connected', () => {
    const gate = useGateStore()
    gate.user = { _id: 'u1', username: 'admin', permissions: [] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    // Do NOT connect simulator — socket.connected is false

    gate.call('some-event', { data: 1 })

    // Should not have emitted yet (queued for connect)
    const emitted = simulator.getEmitted('some-event')
    expect(emitted).toHaveLength(0)

    // Now connect — the queued call should fire
    simulator.connect()

    const emittedAfter = simulator.getEmitted('some-event')
    expect(emittedAfter).toHaveLength(1)
    expect(emittedAfter[0][0]).toEqual({ data: 1 })
  })
})
