import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IEnvironment } from './environment.model'

export const useEnvironmentStore = defineStore('environment', () => {
  const gate = useGateStore()

  const environments = ref<IEnvironment[]>([])
  const subscribedPid = ref<string | null>(null)

  const collectionMap: Record<string, any> = { environments }

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
      tickets: [{ collection: 'environments', filter: { pid } }],
    })

    subscribedPid.value = pid
  }

  function cleanup() {
    if (gate.socket && subscribedPid.value) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['environments'] })
    }
    subscribedPid.value = null
    environments.value = []
  }

  function init(pid: string) {
    if (subscribedPid.value === pid) return
    subscribe(pid)
    gate.onReconnect(() => {
      if (subscribedPid.value) subscribe(subscribedPid.value)
    })
  }

  function saveEnvironment(pid: string, items: any[], id?: string) {
    gate.call('environments:save', { pid, id: id || '_', items })
  }

  function deleteEnvironment(_id: string) {
    gate.call('environments:delete', { _id })
  }

  return { environments, subscribedPid, init, cleanup, saveEnvironment, deleteEnvironment }
})
