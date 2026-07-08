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
import type { IEngine, ICluster } from '@/stores/engines/engines.model'

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

function setupStores() {
  const gate = useGateStore()
  const engines = useEnginesStore()

  gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-engines'] }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'

  gate.connect()
  simulator.connect()

  engines.init()

  return { gate, engines }
}

describe('engines and clusters integration', () => {
  beforeEach(() => {
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
    setActivePinia(createPinia())
  })

  describe('engine creation flow', () => {
    it('creates an engine and receives it via collection-add', () => {
      const { engines } = setupStores()

      // Initialize with empty data
      simulator.simulate('collection-init', 'engines', [])
      simulator.simulate('collection-init', 'clusters', [])

      expect(engines.engines).toHaveLength(0)

      // Create engine
      engines.createEngine({
        alias: 'Render-01',
        address: '10.0.0.1',
        port: 7777,
        rePort: 7778,
        cameraNumber: 1,
      })

      const emitted = simulator.getEmitted('engines:create')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({
        alias: 'Render-01',
        address: '10.0.0.1',
        port: 7777,
        rePort: 7778,
        cameraNumber: 1,
      })

      // Server adds the engine
      simulator.simulate('collection-add', 'engines', makeEngine({
        _id: 'e-new',
        alias: 'Render-01',
        address: '10.0.0.1',
      }))

      expect(engines.engines).toHaveLength(1)
      expect(engines.engines[0].alias).toBe('Render-01')
    })

    it('creates multiple engines', () => {
      const { engines } = setupStores()
      simulator.simulate('collection-init', 'engines', [])
      simulator.simulate('collection-init', 'clusters', [])

      engines.createEngine({ alias: 'A', address: '10.0.0.1' })
      engines.createEngine({ alias: 'B', address: '10.0.0.2' })
      engines.createEngine({ alias: 'C', address: '10.0.0.3' })

      simulator.simulate('collection-add', 'engines', makeEngine({ _id: 'e1', alias: 'A', address: '10.0.0.1' }))
      simulator.simulate('collection-add', 'engines', makeEngine({ _id: 'e2', alias: 'B', address: '10.0.0.2' }))
      simulator.simulate('collection-add', 'engines', makeEngine({ _id: 'e3', alias: 'C', address: '10.0.0.3' }))

      expect(engines.engines).toHaveLength(3)
      expect(engines.filteredEngines.map(e => e.alias)).toEqual(['A', 'B', 'C'])
    })
  })

  describe('cluster creation and engine assignment', () => {
    it('creates a cluster and adds engines to it', () => {
      const { engines } = setupStores()

      // Seed engines
      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'Render-01', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'Render-02', address: '10.0.0.2' }),
        makeEngine({ _id: 'e3', alias: 'Render-03', address: '10.0.0.3' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      // All engines are unclustered
      expect(engines.getUnclusteredEngines()).toHaveLength(3)

      // Create cluster
      engines.createCluster({ alias: 'Farm-A', engines: ['e1', 'e2'] })

      const emitted = simulator.getEmitted('clusters:create')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({ alias: 'Farm-A', engines: ['e1', 'e2'] })

      // Server confirms cluster
      simulator.simulate('collection-add', 'clusters', {
        _id: 'c1',
        alias: 'Farm-A',
        engines: ['e1', 'e2'],
      } as ICluster)

      expect(engines.clusters).toHaveLength(1)
      expect(engines.getClusterEngines('c1')).toHaveLength(2)
      expect(engines.getClusterEngines('c1').map(e => e._id)).toEqual(['e1', 'e2'])

      // Only e3 remains unclustered
      expect(engines.getUnclusteredEngines()).toHaveLength(1)
      expect(engines.getUnclusteredEngines()[0]._id).toBe('e3')
    })

    it('adds an engine to an existing cluster via update', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
        makeEngine({ _id: 'e3', alias: 'C' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm', engines: ['e1'] } as ICluster,
      ])

      // Add e2 to the cluster
      engines.updateCluster({ _id: 'c1', engines: ['e1', 'e2'] })

      const emitted = simulator.getEmitted('clusters:update')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({ _id: 'c1', engines: ['e1', 'e2'] })

      // Server updates
      simulator.simulate('collection-update', 'clusters', {
        _id: 'c1',
        alias: 'Farm',
        engines: ['e1', 'e2'],
      })

      expect(engines.getClusterEngines('c1')).toHaveLength(2)
      expect(engines.getUnclusteredEngines()).toHaveLength(1)
      expect(engines.getUnclusteredEngines()[0]._id).toBe('e3')
    })

    it('removes an engine from a cluster', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm', engines: ['e1', 'e2'] } as ICluster,
      ])

      // Remove e2 from cluster
      engines.updateCluster({ _id: 'c1', engines: ['e1'] })

      simulator.simulate('collection-update', 'clusters', {
        _id: 'c1',
        alias: 'Farm',
        engines: ['e1'],
      })

      expect(engines.getClusterEngines('c1')).toHaveLength(1)
      expect(engines.getUnclusteredEngines()).toHaveLength(1)
      expect(engines.getUnclusteredEngines()[0]._id).toBe('e2')
    })
  })

  describe('multiple clusters', () => {
    it('engines are tracked per cluster correctly', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
        makeEngine({ _id: 'e3', alias: 'C' }),
        makeEngine({ _id: 'e4', alias: 'D' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm-A', engines: ['e1', 'e2'] } as ICluster,
        { _id: 'c2', alias: 'Farm-B', engines: ['e3'] } as ICluster,
      ])

      expect(engines.getClusterEngines('c1').map(e => e._id)).toEqual(['e1', 'e2'])
      expect(engines.getClusterEngines('c2').map(e => e._id)).toEqual(['e3'])
      expect(engines.getUnclusteredEngines().map(e => e._id)).toEqual(['e4'])
    })

    it('getUnclusteredEngines excludes specific cluster', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
        makeEngine({ _id: 'e3', alias: 'C' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm-A', engines: ['e1'] } as ICluster,
        { _id: 'c2', alias: 'Farm-B', engines: ['e2'] } as ICluster,
      ])

      // When editing c1, its engines should appear as available
      const unclustered = engines.getUnclusteredEngines('c1')
      expect(unclustered.map(e => e._id)).toEqual(['e1', 'e3'])
    })
  })

  describe('search and filtering', () => {
    it('filters engines by alias', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'Render-01', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'Preview-01', address: '10.0.0.2' }),
        makeEngine({ _id: 'e3', alias: 'Render-02', address: '10.0.0.3' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.searchPhrase = 'render'

      expect(engines.filteredEngines).toHaveLength(2)
      expect(engines.filteredEngines.map(e => e.alias)).toEqual(['Render-01', 'Render-02'])
    })

    it('filters engines by address', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'B', address: '192.168.1.1' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.searchPhrase = '192.168'
      expect(engines.filteredEngines).toHaveLength(1)
      expect(engines.filteredEngines[0]._id).toBe('e2')
    })

    it('filters clusters by member engine alias', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'Render-Special', address: '10.0.0.1' }),
        makeEngine({ _id: 'e2', alias: 'Preview', address: '10.0.0.2' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm-A', engines: ['e1'] } as ICluster,
        { _id: 'c2', alias: 'Farm-B', engines: ['e2'] } as ICluster,
      ])

      engines.searchPhrase = 'special'

      // Farm-A should match because it contains Render-Special
      expect(engines.filteredClusters).toHaveLength(1)
      expect(engines.filteredClusters[0]._id).toBe('c1')
    })

    it('search returns all when cleared', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.searchPhrase = 'nonexistent'
      expect(engines.filteredEngines).toHaveLength(0)

      engines.searchPhrase = ''
      expect(engines.filteredEngines).toHaveLength(2)
    })
  })

  describe('engine lifecycle', () => {
    it('deletes an engine', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.deleteEngine('e1')

      const emitted = simulator.getEmitted('engines:delete')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({ _id: 'e1' })

      simulator.simulate('collection-delete', 'engines', 'e1')
      expect(engines.engines).toHaveLength(1)
      expect(engines.engines[0]._id).toBe('e2')
    })

    it('deleting a clustered engine updates cluster membership', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm', engines: ['e1', 'e2'] } as ICluster,
      ])

      // Delete e1
      engines.deleteEngine('e1')
      simulator.simulate('collection-delete', 'engines', 'e1')

      // Cluster still references e1 in its engines array, but getClusterEngines filters missing
      const clusterEngines = engines.getClusterEngines('c1')
      expect(clusterEngines).toHaveLength(1)
      expect(clusterEngines[0]._id).toBe('e2')
    })

    it('engine update propagates to store', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'OldAlias', cameraNumber: 1 }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.updateEngine({ _id: 'e1', alias: 'NewAlias', cameraNumber: 3 })

      simulator.simulate('collection-update', 'engines', makeEngine({
        _id: 'e1',
        alias: 'NewAlias',
        cameraNumber: 3,
      }))

      expect(engines.engines[0].alias).toBe('NewAlias')
      expect(engines.engines[0].cameraNumber).toBe(3)
    })
  })

  describe('cluster deletion', () => {
    it('deleting a cluster frees its engines', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
        makeEngine({ _id: 'e2', alias: 'B' }),
      ])
      simulator.simulate('collection-init', 'clusters', [
        { _id: 'c1', alias: 'Farm', engines: ['e1', 'e2'] } as ICluster,
      ])

      expect(engines.getUnclusteredEngines()).toHaveLength(0)

      engines.deleteCluster('c1')
      simulator.simulate('collection-delete', 'clusters', 'c1')

      expect(engines.clusters).toHaveLength(0)
      expect(engines.getUnclusteredEngines()).toHaveLength(2)
    })
  })

  describe('error subscription', () => {
    it('subscribes to engine errors and receives them', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [
        makeEngine({ _id: 'e1', alias: 'A' }),
      ])
      simulator.simulate('collection-init', 'clusters', [])

      engines.subscribeErrors('e1')

      const subEmitted = simulator.getEmitted('subscribe')
      const errorSub = subEmitted.find(args =>
        args[0]?.tickets?.some((t: any) => t.collection === 'engine-errors'),
      )
      expect(errorSub).toBeDefined()

      // Simulate error data
      simulator.simulate('collection-init', 'engine-errors', [
        { _id: 'err1', engineId: 'e1', timestamp: 1000, data: 'Error A' },
        { _id: 'err2', engineId: 'e1', timestamp: 2000, data: 'Error B' },
      ])

      expect(engines.engineErrors).toHaveLength(2)

      // Unsubscribe clears errors
      engines.unsubscribeErrors()
      expect(engines.engineErrors).toEqual([])
    })
  })

  describe('subscription lifecycle', () => {
    it('init subscribes to engines and clusters', () => {
      setupStores()

      const subEmitted = simulator.getEmitted('subscribe')
      const mainSub = subEmitted.find(args =>
        args[0]?.tickets?.some((t: any) => t.collection === 'engines'),
      )
      expect(mainSub).toBeDefined()
      expect(mainSub![0].tickets).toEqual([
        { collection: 'engines', filter: {} },
        { collection: 'clusters', filter: {} },
      ])
    })

    it('cleanup unsubscribes and clears data', () => {
      const { engines } = setupStores()

      simulator.simulate('collection-init', 'engines', [makeEngine({ _id: 'e1', alias: 'A' })])
      simulator.simulate('collection-init', 'clusters', [{ _id: 'c1', alias: 'C', engines: [] }])

      simulator.clearEmitted()
      engines.cleanup()

      expect(engines.engines).toEqual([])
      expect(engines.clusters).toEqual([])
      expect(engines.subscribed).toBe(false)

      const unsub = simulator.getEmitted('unsubscribe')
      expect(unsub).toHaveLength(1)
      expect(unsub[0][0]).toEqual({ collections: ['engines', 'clusters'] })
    })
  })
})
