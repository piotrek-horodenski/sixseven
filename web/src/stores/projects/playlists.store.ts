import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import type { IPlaylist } from './playlists.model'

export const usePlaylistsStore = defineStore('playlists', () => {
  const gate = useGateStore()

  const playlists = ref<IPlaylist[]>([])
  const subscribedPid = ref<string | null>(null)

  const collectionMap: Record<string, any> = { playlists }

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
      tickets: [{ collection: 'playlists', filter: { pid } }],
    })

    subscribedPid.value = pid
  }

  function cleanup() {
    if (gate.socket && subscribedPid.value) {
      gate.socket.off('collection-init', handleCollectionInit)
      gate.socket.off('collection-add', handleCollectionAdd)
      gate.socket.off('collection-update', handleCollectionUpdate)
      gate.socket.off('collection-delete', handleCollectionDelete)
      gate.call('unsubscribe', { collections: ['playlists'] })
    }
    subscribedPid.value = null
    playlists.value = []
  }

  function init(pid: string) {
    if (subscribedPid.value === pid) return
    subscribe(pid)
    gate.onReconnect(() => {
      if (subscribedPid.value) subscribe(subscribedPid.value)
    })
  }

  const sortedPlaylists = computed(() => {
    return [...playlists.value].sort((a, b) => a.order - b.order)
  })

  function createPlaylist(pid: string, name: string) {
    gate.call('playlists:create', { pid, name })
  }

  function updatePlaylist(data: { _id: string; name?: string; order?: number; elements?: any[] }) {
    gate.call('playlists:update', data)
  }

  function deletePlaylist(_id: string) {
    gate.call('playlists:delete', { _id })
  }

  return { playlists, sortedPlaylists, subscribedPid, init, cleanup, createPlaylist, updatePlaylist, deletePlaylist }
})
