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
import { useColorPresetsStore } from '@/stores/color-presets/color-presets.store'

describe('disconnect and reconnect integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('gate connected becomes false on disconnect', () => {
    const gate = useGateStore()
    gate.user = { _id: 'u1', username: 'admin', permissions: [] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()

    expect(gate.connected).toBe(true)

    simulator.connected = false
    simulator.simulate('disconnect')

    expect(gate.connected).toBe(false)
  })

  it('color presets store cleanup unsubscribes and clears data', () => {
    const gate = useGateStore()
    const colorPresets = useColorPresetsStore()

    gate.user = { _id: 'u1', username: 'admin', permissions: [] }
    gate.isAuthenticated = true
    gate.authToken = 'test-token'
    gate.connect()
    simulator.connect()
    colorPresets.init()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
      { _id: 'cp2', hex: '#00ff00', createdAt: 1001 },
    ])
    expect(colorPresets.colorPresets.length).toBeGreaterThanOrEqual(1)

    colorPresets.cleanup()

    expect(colorPresets.colorPresets).toHaveLength(0)
    expect(colorPresets.subscribed).toBe(false)

    const unsubEmitted = simulator.getEmitted('unsubscribe')
    expect(unsubEmitted.length).toBeGreaterThanOrEqual(1)
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
