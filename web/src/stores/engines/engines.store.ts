import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IEngine, ICluster, IEngineError } from './engines.model'

export const useEnginesStore = defineStore('engines', () => {
  const gate = useGateStore()

  const engines = ref<IEngine[]>([])
  const clusters = ref<ICluster[]>([])
  const engineErrors = ref<IEngineError[]>([])
  const searchPhrase = ref('')
  const subscribed = ref(false)
  const errorsSubscribedFor = ref<string | null>(null)

  const collectionMap: Record<string, any> = {
    engines,
    clusters,
    'engine-errors': engineErrors,
  }

  function handleCollectionInit(collection: string, docs: any[]) {
    const target = collectionMap[collection]
    if (target) target.value = docs
  }

  function handleCollectionAdd(collection: string, doc: any) {
    const target = collectionMap[collection]
    if (target) target.value.push(doc)
  }

  function handleCollectionUpdate(collection: string, doc: any) {
    const target = collectionMap[collection]
    if (!target) return
    const index = target.value.findIndex((item: any) => item._id === doc._id)
    if (index !== -1) target.value[index] = doc
  }

  function handleCollectionDelete(collection: string, docId: string) {
    const target = collectionMap[collection]
    if (target) target.value = target.value.filter((item: any) => item._id !== docId)
  }

  function subscribe() {
    if (!gate.socket) return

    gate.socket.on('collection-init', handleCollectionInit)
    gate.socket.on('collection-add', handleCollectionAdd)
    gate.socket.on('collection-update', handleCollectionUpdate)
    gate.socket.on('collection-delete', handleCollectionDelete)

    gate.call('subscribe', {
      tickets: [
        { collection: 'engines', filter: {} },
        { collection: 'clusters', filter: {} },
      ],
    })
  }

  function init() {
    if (subscribed.value) return

    subscribe()

    gate.onReconnect(() => {
      if (subscribed.value) subscribe()
    })

    subscribed.value = true
  }

  function cleanup() {
    if (gate.socket) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['engines', 'clusters'] })
    }
    subscribed.value = false
    engines.value = []
    clusters.value = []
    unsubscribeErrors()
  }

  // Computed
  const filteredEngines = computed(() => {
    const q = searchPhrase.value.trim().toLowerCase()
    if (!q) return [...engines.value].sort((a, b) => a.alias.localeCompare(b.alias))
    return engines.value
      .filter(e =>
        e.alias.toLowerCase().includes(q) ||
        e.address.toLowerCase().includes(q) ||
        e.assignedProject.toLowerCase().includes(q),
      )
      .sort((a, b) => a.alias.localeCompare(b.alias))
  })

  const filteredClusters = computed(() => {
    const q = searchPhrase.value.trim().toLowerCase()
    if (!q) return [...clusters.value].sort((a, b) => a.alias.localeCompare(b.alias))
    return clusters.value
      .filter(c => {
        if (c.alias.toLowerCase().includes(q)) return true
        const memberEngines = engines.value.filter(e => c.engines.includes(e._id))
        return memberEngines.some(e =>
          e.alias.toLowerCase().includes(q) || e.address.toLowerCase().includes(q),
        )
      })
      .sort((a, b) => a.alias.localeCompare(b.alias))
  })

  function getClusterEngines(clusterId: string): IEngine[] {
    const cluster = clusters.value.find(c => c._id === clusterId)
    if (!cluster) return []
    return cluster.engines
      .map(id => engines.value.find(e => e._id === id))
      .filter((e): e is IEngine => !!e)
  }

  function getUnclusteredEngines(excludeClusterId?: string): IEngine[] {
    const clusteredIds = new Set<string>()
    for (const c of clusters.value) {
      if (c._id === excludeClusterId) continue
      for (const id of c.engines) clusteredIds.add(id)
    }
    return engines.value
      .filter(e => !clusteredIds.has(e._id))
      .sort((a, b) => a.alias.localeCompare(b.alias))
  }

  // Actions
  function createEngine(data: { alias: string; address: string; port?: number; rePort?: number; cameraNumber?: number }) {
    gate.call('engines:create', data)
  }

  function updateEngine(data: { _id: string; alias?: string; cameraNumber?: number }) {
    gate.call('engines:update', data)
  }

  function deleteEngine(_id: string) {
    gate.call('engines:delete', { _id })
  }

  function wakeUpEngine(_id: string) {
    gate.call('engines:wake-up', { _id })
  }

  function unlockEngine(_id: string) {
    gate.call('engines:unlock', { _id })
  }

  function showLogs(_id: string) {
    gate.call('engines:show-logs', { _id })
  }

  function clearEngineErrors(_id: string) {
    gate.call('engines:clear-errors', { _id })
  }

  function subscribeErrors(engineId: string) {
    if (!gate.socket) return
    if (errorsSubscribedFor.value === engineId) return
    if (errorsSubscribedFor.value) unsubscribeErrors()

    gate.call('subscribe', {
      tickets: [
        { collection: 'engine-errors', filter: { engineId } },
      ],
    })
    errorsSubscribedFor.value = engineId
  }

  function unsubscribeErrors() {
    if (!gate.socket || !errorsSubscribedFor.value) return
    gate.call('unsubscribe', { collections: ['engine-errors'] })
    errorsSubscribedFor.value = null
    engineErrors.value = []
  }

  function createCluster(data: { alias: string; engines?: string[] }) {
    gate.call('clusters:create', data)
  }

  function updateCluster(data: { _id: string; alias?: string; engines?: string[] }) {
    gate.call('clusters:update', data)
  }

  function deleteCluster(_id: string) {
    gate.call('clusters:delete', { _id })
  }

  return {
    engines,
    clusters,
    engineErrors,
    searchPhrase,
    subscribed,
    filteredEngines,
    filteredClusters,
    init,
    cleanup,
    getClusterEngines,
    getUnclusteredEngines,
    createEngine,
    updateEngine,
    deleteEngine,
    wakeUpEngine,
    unlockEngine,
    showLogs,
    clearEngineErrors,
    subscribeErrors,
    unsubscribeErrors,
    createCluster,
    updateCluster,
    deleteCluster,
  }
})
