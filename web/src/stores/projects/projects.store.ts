import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IProject } from './projects.model'

export const useProjectsStore = defineStore('projects', () => {
  const gate = useGateStore()

  const projects = ref<IProject[]>([])
  const searchPhrase = ref('')
  const subscribed = ref(false)

  const collectionMap: Record<string, any> = {
    projects,
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
        { collection: 'projects', filter: {} },
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
      gate.call('unsubscribe', { collections: ['projects'] })
    }
    subscribed.value = false
    projects.value = []
  }

  // Computed
  const unassignedProjects = computed(() => {
    return projects.value
      .filter(p => !p.concept)
      .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
  })

  // Methods
  function projectsByConcept(conceptId: string): IProject[] {
    const q = searchPhrase.value.trim().toLowerCase()
    let result = conceptId === 'unassigned'
      ? projects.value.filter(p => !p.concept)
      : projects.value.filter(p => p.concept === conceptId)

    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q),
      )
    }

    return result.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
  }

  function getProjectCount(conceptId: string): number {
    return projects.value.filter(p => p.concept === conceptId).length
  }

  // Actions
  function createProject(data: {
    name: string, displayName?: string, map?: string, source?: string,
    type?: string, env?: string, concept?: string
  }) {
    gate.call('projects:create', data)
  }

  function updateProject(data: {
    _id: string, name?: string, displayName?: string, map?: string, source?: string,
    type?: string, env?: string, devEngine?: string, concept?: string,
    useStandalone?: boolean, useBatch?: boolean, productionReady?: boolean
  }) {
    gate.call('projects:update', data)
  }

  function deleteProject(_id: string) {
    gate.call('projects:delete', { _id })
  }

  function assignConcept(_id: string, concept: string) {
    gate.call('projects:assign-concept', { _id, concept })
  }

  function lockProject(_id: string) {
    gate.call('projects:lock', { _id })
  }

  function unlockProject(_id: string) {
    gate.call('projects:unlock', { _id })
  }

  // Lifecycle actions
  function loadProject(_id: string, editor?: boolean) {
    gate.call('projects:load', { _id, editor })
  }

  function unloadProject(_id: string) {
    gate.call('projects:unload', { _id })
  }

  function syncProject(_id: string) {
    gate.call('projects:sync', { _id })
  }

  function resetProject(_id: string) {
    gate.call('projects:reset', { _id })
  }

  function loadDefs(_id: string) {
    gate.call('projects:load-defs', { _id })
  }

  return {
    projects,
    searchPhrase,
    subscribed,
    unassignedProjects,
    init,
    cleanup,
    projectsByConcept,
    getProjectCount,
    createProject,
    updateProject,
    deleteProject,
    assignConcept,
    lockProject,
    unlockProject,
    loadProject,
    unloadProject,
    syncProject,
    resetProject,
    loadDefs,
  }
})
