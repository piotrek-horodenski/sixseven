import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IColorPreset } from './color-presets.model'

export const useColorPresetsStore = defineStore('color-presets', () => {
  const gate = useGateStore()

  const colorPresets = ref<IColorPreset[]>([])
  const subscribed = ref(false)

  const collectionMap: Record<string, any> = {
    'color-presets': colorPresets,
  }

  function handleCollectionInit(collection: string, docs: any[]) {
    const target = collectionMap[collection]
    if (target) target.value = docs
  }

  function handleCollectionAdd(collection: string, doc: any) {
    const target = collectionMap[collection]
    if (!target) return
    const exists = target.value.some((item: any) => item._id === doc._id)
    if (exists) return
    target.value.push(doc)
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

    gate.call('subscribe', {
      tickets: [
        { collection: 'color-presets', filter: {} },
      ],
    })
  }

  function registerListeners() {
    if (!gate.socket) return
    gate.socket.on('collection-init', handleCollectionInit)
    gate.socket.on('collection-add', handleCollectionAdd)
    gate.socket.on('collection-update', handleCollectionUpdate)
    gate.socket.on('collection-delete', handleCollectionDelete)
  }

  function init() {
    if (subscribed.value) return
    subscribed.value = true

    registerListeners()

    gate.onReconnect(() => {
      registerListeners()
      gate.call('subscribe', {
        tickets: [
          { collection: 'color-presets', filter: {} },
        ],
      })
    })

    subscribe()
  }

  function cleanup() {
    if (gate.socket) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['color-presets'] })
    }
    subscribed.value = false
    colorPresets.value = []
  }

  function createPreset(hex: string) {
    gate.call('color-presets:create', { hex: hex.toLowerCase() })
  }

  function deletePreset(_id: string) {
    gate.call('color-presets:delete', { _id })
  }

  return {
    colorPresets,
    subscribed,
    init,
    cleanup,
    createPreset,
    deletePreset,
  }
})
