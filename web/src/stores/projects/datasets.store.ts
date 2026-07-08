import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IDataset } from './datasets.model'

export const useDatasetsStore = defineStore('datasets', () => {
  const gate = useGateStore()

  const datasets = ref<IDataset[]>([])
  const subscribedPid = ref<string | null>(null)

  const collectionMap: Record<string, any> = { datasets }

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
      tickets: [{ collection: 'datasets', filter: { pid } }],
    })

    subscribedPid.value = pid
  }

  function cleanup() {
    if (gate.socket && subscribedPid.value) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['datasets'] })
    }
    subscribedPid.value = null
    datasets.value = []
  }

  function init(pid: string) {
    if (subscribedPid.value === pid) return
    subscribe(pid)
    gate.onReconnect(() => {
      if (subscribedPid.value) subscribe(subscribedPid.value)
    })
  }

  function createDataset(pid: string, label: string) {
    gate.call('datasets:create', { pid, label })
  }

  function updateDataset(data: { _id: string; label?: string; name?: string; currentVersionId?: string }) {
    gate.call('datasets:update', data)
  }

  function deleteDataset(_id: string, datasetId: string) {
    gate.call('datasets:delete', { _id, datasetId })
  }

  return { datasets, subscribedPid, init, cleanup, createDataset, updateDataset, deleteDataset }
})
