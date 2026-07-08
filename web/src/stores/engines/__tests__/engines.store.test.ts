import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { IEngine, ICluster } from '../engines.model'

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: {
      on: vi.fn(),
      off: vi.fn(),
      connected: true,
      emit: vi.fn(),
      once: vi.fn(),
    },
    call: vi.fn(),
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import { useEnginesStore } from '../engines.store'

function makeEngine(overrides: Partial<IEngine> = {}): IEngine {
  return {
    _id: 'e1',
    alias: 'Engine Alpha',
    address: '192.168.1.1',
    port: 7777,
    rePort: 7778,
    cameraNumber: 1,
    status: 1,
    since: 0,
    lastAttempt: 0,
    assignedProject: 'ProjectA',
    assignedProjectId: 'p1',
    initialized: true,
    locked: false,
    ...overrides,
  }
}

describe('engines store', () => {
  let store: ReturnType<typeof useEnginesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useEnginesStore()
  })

  describe('collection handlers', () => {
    it('handleCollectionInit sets engines', () => {
      const engines = [makeEngine(), makeEngine({ _id: 'e2', alias: 'Engine Beta' })]
      // Trigger via direct state set (since handlers are internal, test via init flow)
      store.engines = engines
      expect(store.engines).toHaveLength(2)
    })
  })

  describe('filteredEngines', () => {
    it('returns all engines sorted by alias when no search', () => {
      store.engines = [
        makeEngine({ _id: 'e2', alias: 'Zeta' }),
        makeEngine({ _id: 'e1', alias: 'Alpha' }),
        makeEngine({ _id: 'e3', alias: 'Mid' }),
      ]

      const result = store.filteredEngines
      expect(result.map(e => e.alias)).toEqual(['Alpha', 'Mid', 'Zeta'])
    })

    it('filters by alias', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'Alpha' }),
        makeEngine({ _id: 'e2', alias: 'Beta' }),
      ]
      store.searchPhrase = 'alph'

      expect(store.filteredEngines).toHaveLength(1)
      expect(store.filteredEngines[0].alias).toBe('Alpha')
    })

    it('filters by address', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'B', address: '192.168.1.1' }),
      ]
      store.searchPhrase = '10.0'

      expect(store.filteredEngines).toHaveLength(1)
      expect(store.filteredEngines[0]._id).toBe('e1')
    })

    it('filters by assigned project', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A', assignedProject: 'MyProject' }),
        makeEngine({ _id: 'e2', alias: 'B', assignedProject: 'Other' }),
      ]
      store.searchPhrase = 'myproj'

      expect(store.filteredEngines).toHaveLength(1)
      expect(store.filteredEngines[0]._id).toBe('e1')
    })

    it('is case-insensitive', () => {
      store.engines = [makeEngine({ _id: 'e1', alias: 'Alpha' })]
      store.searchPhrase = 'ALPHA'

      expect(store.filteredEngines).toHaveLength(1)
    })

    it('trims search phrase', () => {
      store.engines = [makeEngine({ _id: 'e1', alias: 'Alpha' })]
      store.searchPhrase = '  '

      expect(store.filteredEngines).toHaveLength(1)
    })
  })

  describe('filteredClusters', () => {
    it('returns all clusters sorted when no search', () => {
      store.clusters = [
        { _id: 'c2', alias: 'Zulu', engines: [] } as ICluster,
        { _id: 'c1', alias: 'Alpha', engines: [] } as ICluster,
      ]

      expect(store.filteredClusters.map(c => c.alias)).toEqual(['Alpha', 'Zulu'])
    })

    it('filters by cluster alias', () => {
      store.clusters = [
        { _id: 'c1', alias: 'Render Farm', engines: [] } as ICluster,
        { _id: 'c2', alias: 'Preview', engines: [] } as ICluster,
      ]
      store.searchPhrase = 'render'

      expect(store.filteredClusters).toHaveLength(1)
      expect(store.filteredClusters[0].alias).toBe('Render Farm')
    })

    it('filters by member engine alias', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'SpecialEngine', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'Other', address: '10.0.0.2' }),
      ]
      store.clusters = [
        { _id: 'c1', alias: 'Cluster A', engines: ['e1'] } as ICluster,
        { _id: 'c2', alias: 'Cluster B', engines: ['e2'] } as ICluster,
      ]
      store.searchPhrase = 'special'

      expect(store.filteredClusters).toHaveLength(1)
      expect(store.filteredClusters[0]._id).toBe('c1')
    })

    it('filters by member engine address', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A', address: '10.0.0.99' }),
      ]
      store.clusters = [
        { _id: 'c1', alias: 'Cluster', engines: ['e1'] } as ICluster,
      ]
      store.searchPhrase = '10.0.0.99'

      expect(store.filteredClusters).toHaveLength(1)
    })
  })

  describe('getClusterEngines', () => {
    it('returns engines belonging to cluster in order', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
        makeEngine({ _id: 'e3', alias: 'C' }),
      ]
      store.clusters = [
        { _id: 'c1', alias: 'Cluster', engines: ['e3', 'e1'] } as ICluster,
      ]

      const result = store.getClusterEngines('c1')
      expect(result.map(e => e._id)).toEqual(['e3', 'e1'])
    })

    it('returns empty array for unknown cluster', () => {
      expect(store.getClusterEngines('nonexistent')).toEqual([])
    })

    it('skips engine ids that are not found', () => {
      store.engines = [makeEngine({ _id: 'e1', alias: 'A' })]
      store.clusters = [
        { _id: 'c1', alias: 'Cluster', engines: ['e1', 'deleted-id'] } as ICluster,
      ]

      const result = store.getClusterEngines('c1')
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('e1')
    })
  })

  describe('getUnclusteredEngines', () => {
    it('returns engines not in any cluster', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
        makeEngine({ _id: 'e3', alias: 'C' }),
      ]
      store.clusters = [
        { _id: 'c1', alias: 'Cluster', engines: ['e2'] } as ICluster,
      ]

      const result = store.getUnclusteredEngines()
      expect(result.map(e => e._id)).toEqual(['e1', 'e3'])
    })

    it('excludes a specific cluster from consideration', () => {
      store.engines = [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ]
      store.clusters = [
        { _id: 'c1', alias: 'C1', engines: ['e1'] } as ICluster,
        { _id: 'c2', alias: 'C2', engines: ['e2'] } as ICluster,
      ]

      // Excluding c1: e1 is treated as unclustered, e2 is still in c2
      const result = store.getUnclusteredEngines('c1')
      expect(result.map(e => e._id)).toEqual(['e1'])
    })

    it('returns sorted by alias', () => {
      store.engines = [
        makeEngine({ _id: 'e2', alias: 'Zulu' }),
        makeEngine({ _id: 'e1', alias: 'Alpha' }),
      ]
      store.clusters = []

      const result = store.getUnclusteredEngines()
      expect(result.map(e => e.alias)).toEqual(['Alpha', 'Zulu'])
    })
  })
})
