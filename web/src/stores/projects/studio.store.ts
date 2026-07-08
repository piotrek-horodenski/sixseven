import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IStudioPreset, IMasksPreset } from './studio.model'

export const useStudioStore = defineStore('studio', () => {
  const gate = useGateStore()

  const presets = ref<IStudioPreset[]>([])
  const masksPresets = ref<IMasksPreset[]>([])
  const subscribedPid = ref<string | null>(null)

  const collectionMap: Record<string, any> = {
    'studio-presets': presets,
    'masks-presets': masksPresets,
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

  function subscribe(pid: string) {
    if (!gate.socket) return
    cleanup()

    gate.socket.on('collection-init', handleCollectionInit)
    gate.socket.on('collection-add', handleCollectionAdd)
    gate.socket.on('collection-update', handleCollectionUpdate)
    gate.socket.on('collection-delete', handleCollectionDelete)

    gate.call('subscribe', {
      tickets: [
        { collection: 'studio-presets', filter: { pid } },
        { collection: 'masks-presets', filter: { pid } },
      ],
    })

    subscribedPid.value = pid
  }

  function cleanup() {
    if (gate.socket && subscribedPid.value) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['studio-presets', 'masks-presets'] })
    }
    subscribedPid.value = null
    presets.value = []
    masksPresets.value = []
  }

  function init(pid: string) {
    if (subscribedPid.value === pid) return
    subscribe(pid)
    gate.onReconnect(() => {
      if (subscribedPid.value) subscribe(subscribedPid.value)
    })
  }

  function createPreset(data: { pid: string; name: string; cameraIndex?: number; position?: any; rotation?: any; aperture?: number }) {
    gate.call('studio-presets:create', data)
  }

  function deletePreset(_id: string) {
    gate.call('studio-presets:delete', { _id })
  }

  function createMasksPreset(data: { pid: string; name: string; masks?: any[] }) {
    gate.call('masks-presets:create', data)
  }

  function deleteMasksPreset(_id: string) {
    gate.call('masks-presets:delete', { _id })
  }

  return { presets, masksPresets, subscribedPid, init, cleanup, createPreset, deletePreset, createMasksPreset, deleteMasksPreset }
})
