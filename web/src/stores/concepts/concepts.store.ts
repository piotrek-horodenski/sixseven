import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IConcept } from './concepts.model'

export const useConceptsStore = defineStore('concepts', () => {
  const gate = useGateStore()

  const concepts = ref<IConcept[]>([])
  const searchPhrase = ref('')
  const subscribed = ref(false)

  const collectionMap: Record<string, any> = {
    concepts,
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
        { collection: 'concepts', filter: {} },
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
      gate.call('unsubscribe', { collections: ['concepts'] })
    }
    subscribed.value = false
    concepts.value = []
  }

  // Computed
  const filteredConcepts = computed(() => {
    const q = searchPhrase.value.trim().toLowerCase()
    if (!q) return [...concepts.value].sort((a, b) => a.name.localeCompare(b.name))
    return concepts.value
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  // Actions
  function createConcept(data: { name: string; description?: string }) {
    gate.call('concepts:create', data)
  }

  function updateConcept(data: { _id: string; name?: string; description?: string }) {
    gate.call('concepts:update', data)
  }

  function deleteConcept(_id: string) {
    gate.call('concepts:delete', { _id })
  }

  return {
    concepts,
    searchPhrase,
    subscribed,
    filteredConcepts,
    init,
    cleanup,
    createConcept,
    updateConcept,
    deleteConcept,
  }
})
