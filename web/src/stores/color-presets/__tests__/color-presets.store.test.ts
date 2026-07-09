import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: {
      on: mockOn,
      off: mockOff,
      connected: true,
      emit: vi.fn(),
      once: vi.fn(),
    },
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import { useColorPresetsStore } from '../color-presets.store'

function getHandler(name: string) {
  return mockOn.mock.calls.find((c: any) => c[0] === name)?.[1]
}

describe('color-presets store', () => {
  let store: ReturnType<typeof useColorPresetsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useColorPresetsStore()
    store.init()
  })

  describe('subscribe', () => {
    it('registers all socket listeners', () => {
      expect(mockOn).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-delete', expect.any(Function))
    })

    it('subscribes to color-presets collection', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [
          { collection: 'color-presets', filter: {} },
        ],
      })
    })

    it('does not re-subscribe on second init', () => {
      store.init()
      expect(mockCall).toHaveBeenCalledTimes(1)
    })
  })

  describe('collection-init', () => {
    it('initializes presets', () => {
      const handler = getHandler('collection-init')
      handler('color-presets', [
        { _id: 'p1', hex: '#ff0000', createdAt: 1 },
        { _id: 'p2', hex: '#00ff00', createdAt: 2 },
      ])
      expect(store.colorPresets).toHaveLength(2)
    })

    it('ignores unknown collections', () => {
      const handler = getHandler('collection-init')
      handler('unknown', [{ _id: '1' }])
      expect(store.colorPresets).toHaveLength(0)
    })
  })

  describe('collection-add', () => {
    it('pushes new preset', () => {
      const handler = getHandler('collection-add')
      handler('color-presets', { _id: 'p1', hex: '#ff0000', createdAt: 1 })
      expect(store.colorPresets).toHaveLength(1)
      expect(store.colorPresets[0].hex).toBe('#ff0000')
    })

    it('deduplicates by _id', () => {
      const handler = getHandler('collection-add')
      handler('color-presets', { _id: 'p1', hex: '#ff0000', createdAt: 1 })
      handler('color-presets', { _id: 'p1', hex: '#ff0000', createdAt: 1 })
      expect(store.colorPresets).toHaveLength(1)
    })
  })

  describe('collection-update', () => {
    it('replaces existing preset by _id', () => {
      const initHandler = getHandler('collection-init')
      const updateHandler = getHandler('collection-update')

      initHandler('color-presets', [{ _id: 'p1', hex: '#ff0000', createdAt: 1 }])
      updateHandler('color-presets', { _id: 'p1', hex: '#00ff00', createdAt: 1 })

      expect(store.colorPresets[0].hex).toBe('#00ff00')
    })
  })

  describe('collection-delete', () => {
    it('removes preset by id', () => {
      const initHandler = getHandler('collection-init')
      const deleteHandler = getHandler('collection-delete')

      initHandler('color-presets', [
        { _id: 'p1', hex: '#ff0000', createdAt: 1 },
        { _id: 'p2', hex: '#00ff00', createdAt: 2 },
      ])
      deleteHandler('color-presets', 'p1')

      expect(store.colorPresets).toHaveLength(1)
      expect(store.colorPresets[0]._id).toBe('p2')
    })
  })

  describe('actions', () => {
    it('createPreset calls gate with lowercase hex', () => {
      vi.clearAllMocks()
      store.createPreset('#FF0000')
      expect(mockCall).toHaveBeenCalledWith('color-presets:create', { hex: '#ff0000' })
    })

    it('deletePreset calls gate', () => {
      vi.clearAllMocks()
      store.deletePreset('p1')
      expect(mockCall).toHaveBeenCalledWith('color-presets:delete', { _id: 'p1' })
    })
  })

  describe('cleanup', () => {
    it('removes listeners and clears data', () => {
      const initHandler = getHandler('collection-init')
      initHandler('color-presets', [{ _id: 'p1', hex: '#ff0000', createdAt: 1 }])

      vi.clearAllMocks()
      store.cleanup()

      expect(mockOff).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-delete', expect.any(Function))
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['color-presets'] })
      expect(store.colorPresets).toEqual([])
      expect(store.subscribed).toBe(false)
    })
  })
})
