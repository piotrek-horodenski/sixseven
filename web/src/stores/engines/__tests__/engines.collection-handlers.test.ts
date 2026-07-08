import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { IEngine } from '../engines.model'

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

import { useEnginesStore } from '../engines.store'

function getHandler(name: string) {
  return mockOn.mock.calls.find((c: any) => c[0] === name)?.[1]
}

describe('engines store collection handlers', () => {
  let store: ReturnType<typeof useEnginesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useEnginesStore()
    store.init()
  })

  describe('subscribe', () => {
    it('registers all socket listeners', () => {
      expect(mockOn).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-delete', expect.any(Function))
    })

    it('subscribes to engines and clusters collections', () => {
      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [
          { collection: 'engines', filter: {} },
          { collection: 'clusters', filter: {} },
        ],
      })
    })

    it('does not re-subscribe on second init', () => {
      store.init()
      // call was invoked once during first init
      expect(mockCall).toHaveBeenCalledTimes(1)
    })
  })

  describe('collection-init', () => {
    it('initializes engines', () => {
      const handler = getHandler('collection-init')
      handler('engines', [{ _id: 'e1', alias: 'A' }, { _id: 'e2', alias: 'B' }])
      expect(store.engines).toHaveLength(2)
    })

    it('initializes clusters', () => {
      const handler = getHandler('collection-init')
      handler('clusters', [{ _id: 'c1', alias: 'C1', engines: [] }])
      expect(store.clusters).toHaveLength(1)
    })

    it('initializes engine-errors', () => {
      const handler = getHandler('collection-init')
      handler('engine-errors', [{ _id: 'err1', engineId: 'e1', data: 'boom' }])
      expect(store.engineErrors).toHaveLength(1)
    })

    it('ignores unknown collections', () => {
      const handler = getHandler('collection-init')
      handler('unknown', [{ _id: '1' }])
      // Should not throw
    })
  })

  describe('collection-add', () => {
    it('pushes new engine', () => {
      const handler = getHandler('collection-add')
      handler('engines', { _id: 'e1', alias: 'New' })
      expect(store.engines).toHaveLength(1)
    })

    it('pushes new cluster', () => {
      const handler = getHandler('collection-add')
      handler('clusters', { _id: 'c1', alias: 'New Cluster', engines: [] })
      expect(store.clusters).toHaveLength(1)
    })
  })

  describe('collection-update', () => {
    it('replaces existing engine by _id', () => {
      const initHandler = getHandler('collection-init')
      const updateHandler = getHandler('collection-update')

      initHandler('engines', [{ _id: 'e1', alias: 'Old', status: 0 }])
      updateHandler('engines', { _id: 'e1', alias: 'Updated', status: 1 })

      expect(store.engines[0].alias).toBe('Updated')
      expect(store.engines[0].status).toBe(1)
    })

    it('does nothing for unknown _id', () => {
      const initHandler = getHandler('collection-init')
      const updateHandler = getHandler('collection-update')

      initHandler('engines', [{ _id: 'e1', alias: 'A' }])
      updateHandler('engines', { _id: 'unknown', alias: 'X' })

      expect(store.engines).toHaveLength(1)
      expect(store.engines[0].alias).toBe('A')
    })
  })

  describe('collection-delete', () => {
    it('removes engine by id', () => {
      const initHandler = getHandler('collection-init')
      const deleteHandler = getHandler('collection-delete')

      initHandler('engines', [{ _id: 'e1' }, { _id: 'e2' }, { _id: 'e3' }])
      deleteHandler('engines', 'e2')

      expect(store.engines).toHaveLength(2)
      expect(store.engines.map((e: any) => e._id)).toEqual(['e1', 'e3'])
    })
  })

  describe('cleanup', () => {
    it('removes listeners and clears data', () => {
      const initHandler = getHandler('collection-init')
      initHandler('engines', [{ _id: 'e1' }])
      initHandler('clusters', [{ _id: 'c1' }])

      vi.clearAllMocks()
      store.cleanup()

      expect(mockOff).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-delete', expect.any(Function))
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['engines', 'clusters'] })
      expect(store.engines).toEqual([])
      expect(store.clusters).toEqual([])
      expect(store.subscribed).toBe(false)
    })
  })

  describe('error subscription', () => {
    it('subscribeErrors subscribes to engine-errors for engine', () => {
      vi.clearAllMocks()
      store.subscribeErrors('e1')

      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [{ collection: 'engine-errors', filter: { engineId: 'e1' } }],
      })
    })

    it('subscribeErrors does not re-subscribe for same engine', () => {
      vi.clearAllMocks()
      store.subscribeErrors('e1')
      store.subscribeErrors('e1')

      expect(mockCall).toHaveBeenCalledTimes(1)
    })

    it('unsubscribeErrors clears errors and unsubscribes', () => {
      store.subscribeErrors('e1')
      store.engineErrors = [{ _id: 'err1', engineId: 'e1', timestamp: 0, data: 'x' }]

      vi.clearAllMocks()
      store.unsubscribeErrors()

      expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['engine-errors'] })
      expect(store.engineErrors).toEqual([])
    })
  })

  describe('CRUD actions', () => {
    it('createEngine calls gate', () => {
      vi.clearAllMocks()
      store.createEngine({ alias: 'New', address: '10.0.0.1' })
      expect(mockCall).toHaveBeenCalledWith('engines:create', { alias: 'New', address: '10.0.0.1' })
    })

    it('updateEngine calls gate', () => {
      vi.clearAllMocks()
      store.updateEngine({ _id: 'e1', alias: 'Updated' })
      expect(mockCall).toHaveBeenCalledWith('engines:update', { _id: 'e1', alias: 'Updated' })
    })

    it('deleteEngine calls gate', () => {
      vi.clearAllMocks()
      store.deleteEngine('e1')
      expect(mockCall).toHaveBeenCalledWith('engines:delete', { _id: 'e1' })
    })

    it('wakeUpEngine calls gate', () => {
      vi.clearAllMocks()
      store.wakeUpEngine('e1')
      expect(mockCall).toHaveBeenCalledWith('engines:wake-up', { _id: 'e1' })
    })

    it('unlockEngine calls gate', () => {
      vi.clearAllMocks()
      store.unlockEngine('e1')
      expect(mockCall).toHaveBeenCalledWith('engines:unlock', { _id: 'e1' })
    })

    it('createCluster calls gate', () => {
      vi.clearAllMocks()
      store.createCluster({ alias: 'Farm' })
      expect(mockCall).toHaveBeenCalledWith('clusters:create', { alias: 'Farm' })
    })

    it('updateCluster calls gate', () => {
      vi.clearAllMocks()
      store.updateCluster({ _id: 'c1', alias: 'Updated', engines: ['e1'] })
      expect(mockCall).toHaveBeenCalledWith('clusters:update', { _id: 'c1', alias: 'Updated', engines: ['e1'] })
    })

    it('deleteCluster calls gate', () => {
      vi.clearAllMocks()
      store.deleteCluster('c1')
      expect(mockCall).toHaveBeenCalledWith('clusters:delete', { _id: 'c1' })
    })
  })
})
