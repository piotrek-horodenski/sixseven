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
import { useColorPresetsStore } from '@/stores/color-presets/color-presets.store'

function setupStores() {
  const gate = useGateStore()
  const colorPresets = useColorPresetsStore()

  gate.user = { _id: 'u1', username: 'testuser', permissions: [] }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'

  gate.connect()
  simulator.connect()

  colorPresets.init()

  return { gate, colorPresets }
}

describe('color presets integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
  })

  it('initializes presets from collection-init', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
      { _id: 'cp2', hex: '#00ff00', createdAt: 2000 },
    ])

    expect(colorPresets.colorPresets).toHaveLength(2)
    expect(colorPresets.colorPresets[0].hex).toBe('#ff0000')
  })

  it('creates a preset and receives it via collection-add', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [])

    colorPresets.createPreset('#AABB00')

    const emitted = simulator.getEmitted('color-presets:create')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ hex: '#aabb00' })

    simulator.simulate('collection-add', 'color-presets', {
      _id: 'cp-new', hex: '#aabb00', createdAt: Date.now(),
    })

    expect(colorPresets.colorPresets).toHaveLength(1)
    expect(colorPresets.colorPresets[0].hex).toBe('#aabb00')
  })

  it('does not add duplicate preset on collection-add', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
    ])

    // Simulate duplicate add
    simulator.simulate('collection-add', 'color-presets', {
      _id: 'cp1', hex: '#ff0000', createdAt: 1000,
    })

    expect(colorPresets.colorPresets).toHaveLength(1)
  })

  it('deletes a preset and receives removal via collection-delete', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
      { _id: 'cp2', hex: '#00ff00', createdAt: 2000 },
    ])

    colorPresets.deletePreset('cp1')

    const emitted = simulator.getEmitted('color-presets:delete')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({ _id: 'cp1' })

    simulator.simulate('collection-delete', 'color-presets', 'cp1')

    expect(colorPresets.colorPresets).toHaveLength(1)
    expect(colorPresets.colorPresets[0]._id).toBe('cp2')
  })

  it('handles collection-update for a preset', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
    ])

    simulator.simulate('collection-update', 'color-presets', {
      _id: 'cp1', hex: '#ff0001', createdAt: 1000,
    })

    expect(colorPresets.colorPresets[0].hex).toBe('#ff0001')
  })

  it('cleanup unsubscribes and clears state', () => {
    const { colorPresets } = setupStores()

    simulator.simulate('collection-init', 'color-presets', [
      { _id: 'cp1', hex: '#ff0000', createdAt: 1000 },
    ])

    colorPresets.cleanup()

    expect(colorPresets.colorPresets).toHaveLength(0)
    expect(colorPresets.subscribed).toBe(false)

    const unsubEmitted = simulator.getEmitted('unsubscribe')
    expect(unsubEmitted.length).toBeGreaterThanOrEqual(1)
  })

  it('subscribes to color-presets collection on init', () => {
    setupStores()

    const emitted = simulator.getEmitted('subscribe')
    expect(emitted.length).toBeGreaterThanOrEqual(1)

    const hasColorPresetsTicket = emitted.some((args: any[]) =>
      args[0].tickets.some((t: any) => t.collection === 'color-presets'),
    )
    expect(hasColorPresetsTicket).toBe(true)
  })

  it('init is idempotent — calling twice does not duplicate subscriptions', () => {
    const { colorPresets } = setupStores()

    simulator.clearEmitted()

    colorPresets.init() // second call

    const emitted = simulator.getEmitted('subscribe')
    expect(emitted).toHaveLength(0) // no new subscription
  })
})
