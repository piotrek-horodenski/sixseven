import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'

export const useAdminStore = defineStore('admin', () => {
  const gate = useGateStore()

  const users = ref<any[]>([])
  const roles = ref<any[]>([])
  const permissions = ref<any[]>([])
  const settings = ref<any[]>([])
  const subscribed = ref(false)
  const syncing = ref(false)

  const collectionMap: Record<string, any> = {
    users,
    roles,
    permissions,
    settings,
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

    gate.socket.on('admin:sync-users-complete', () => { syncing.value = false })
    gate.socket.on('admin:sync-users-stopped', () => { syncing.value = false })

    gate.call('subscribe', {
      tickets: [
        { collection: 'users', filter: {} },
        { collection: 'roles', filter: {} },
        { collection: 'permissions', filter: {} },
        { collection: 'settings', filter: {} },
      ],
    })
  }

  function init() {
    if (subscribed.value) return

    subscribe()

    // Re-subscribe when socket reconnects (new socket after disconnect)
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
      gate.call('unsubscribe', { collections: ['users', 'roles', 'permissions', 'settings'] })
    }
    subscribed.value = false
    users.value = []
    roles.value = []
    permissions.value = []
    settings.value = []
  }

  function updateUserRoles(userId: string, roleNames: string[]) {
    gate.call('admin:users:update-roles', { userId, roles: roleNames })
  }

  function deleteUser(userId: string) {
    gate.call('admin:users:delete', { userId })
  }

  function createRole(data: { name: string, display: string, permissions: string[], useRoles: string[] }) {
    gate.call('admin:roles:create', data)
  }

  function updateRole(data: { _id: string, display: string, permissions: string[], useRoles: string[] }) {
    gate.call('admin:roles:update', data)
  }

  function deleteRole(_id: string) {
    gate.call('admin:roles:delete', { _id })
  }

  function syncUsers() {
    syncing.value = true
    gate.call('admin:sync-users')
  }

  function updateSetting(_id: string, value: unknown) {
    gate.call('admin:settings:update', { _id, value })
  }

  function createSetting(data: { name: string, display: string, type: string, value: unknown }) {
    gate.call('admin:settings:create', data)
  }

  function deleteSetting(_id: string) {
    gate.call('admin:settings:delete', { _id })
  }

  return {
    users,
    roles,
    permissions,
    settings,
    subscribed,
    syncing,
    init,
    cleanup,
    updateUserRoles,
    deleteUser,
    createRole,
    updateRole,
    deleteRole,
    syncUsers,
    updateSetting,
    createSetting,
    deleteSetting,
  }
})
