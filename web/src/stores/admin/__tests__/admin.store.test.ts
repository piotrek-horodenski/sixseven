import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockCall = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: {
      on: mockOn,
      off: mockOff,
      connected: true,
      emit: vi.fn(),
      once: vi.fn(),
    },
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import { useAdminStore } from '../admin.store'

describe('admin store', () => {
  let store: ReturnType<typeof useAdminStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useAdminStore()
  })

  describe('init', () => {
    it('subscribes to collections on first call', () => {
      store.init()

      expect(mockCall).toHaveBeenCalledWith('subscribe', {
        tickets: [
          { collection: 'users', filter: {} },
          { collection: 'roles', filter: {} },
          { collection: 'permissions', filter: {} },
          { collection: 'settings', filter: {} },
        ],
      })
      expect(store.subscribed).toBe(true)
    })

    it('does not re-subscribe on second call', () => {
      store.init()
      store.init()

      expect(mockCall).toHaveBeenCalledTimes(1)
    })

    it('registers socket event listeners', () => {
      store.init()

      expect(mockOn).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('collection-delete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('admin:sync-users-complete', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('admin:sync-users-stopped', expect.any(Function))
    })
  })

  describe('collection handlers', () => {
    it('collection-init sets the collection data', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]

      initHandler('users', [{ _id: 'u1', name: 'Alice' }, { _id: 'u2', name: 'Bob' }])
      expect(store.users).toHaveLength(2)
      expect(store.users[0].name).toBe('Alice')
    })

    it('collection-add pushes a new doc', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]
      const addHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-add')[1]

      initHandler('roles', [{ _id: 'r1', name: 'admin' }])
      addHandler('roles', { _id: 'r2', name: 'user' })

      expect(store.roles).toHaveLength(2)
      expect(store.roles[1].name).toBe('user')
    })

    it('collection-update replaces existing doc', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]
      const updateHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-update')[1]

      initHandler('settings', [{ _id: 's1', name: 'register', value: true }])
      updateHandler('settings', { _id: 's1', name: 'register', value: false })

      expect(store.settings[0].value).toBe(false)
    })

    it('collection-update ignores unknown doc id', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]
      const updateHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-update')[1]

      initHandler('permissions', [{ _id: 'p1', name: 'manage-users' }])
      updateHandler('permissions', { _id: 'unknown', name: 'x' })

      expect(store.permissions).toHaveLength(1)
      expect(store.permissions[0].name).toBe('manage-users')
    })

    it('collection-delete removes doc by id', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]
      const deleteHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-delete')[1]

      initHandler('users', [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }])
      deleteHandler('users', 'u2')

      expect(store.users).toHaveLength(2)
      expect(store.users.map((u: any) => u._id)).toEqual(['u1', 'u3'])
    })

    it('ignores unknown collection names', () => {
      store.init()
      const initHandler = mockOn.mock.calls.find((c: any) => c[0] === 'collection-init')[1]
      // Should not throw
      initHandler('unknown-collection', [{ _id: '1' }])
    })
  })

  describe('cleanup', () => {
    it('unsubscribes from socket events and clears data', () => {
      store.init()
      store.users = [{ _id: 'u1' }] as any
      store.roles = [{ _id: 'r1' }] as any

      store.cleanup()

      expect(mockOff).toHaveBeenCalledWith('collection-init', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-add', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-update', expect.any(Function))
      expect(mockOff).toHaveBeenCalledWith('collection-delete', expect.any(Function))
      expect(mockCall).toHaveBeenCalledWith('unsubscribe', {
        collections: ['users', 'roles', 'permissions', 'settings'],
      })
      expect(store.users).toEqual([])
      expect(store.roles).toEqual([])
      expect(store.permissions).toEqual([])
      expect(store.settings).toEqual([])
      expect(store.subscribed).toBe(false)
    })
  })

  describe('CRUD actions', () => {
    beforeEach(() => {
      store.init()
      vi.clearAllMocks()
    })

    it('updateUserRoles calls gate with correct args', () => {
      store.updateUserRoles('u1', ['admin', 'user'])
      expect(mockCall).toHaveBeenCalledWith('admin:users:update-roles', { userId: 'u1', roles: ['admin', 'user'] })
    })

    it('deleteUser calls gate', () => {
      store.deleteUser('u1')
      expect(mockCall).toHaveBeenCalledWith('admin:users:delete', { userId: 'u1' })
    })

    it('createRole calls gate', () => {
      const data = { name: 'editor', display: 'Editor', permissions: ['edit'], useRoles: [] }
      store.createRole(data)
      expect(mockCall).toHaveBeenCalledWith('admin:roles:create', data)
    })

    it('updateRole calls gate', () => {
      const data = { _id: 'r1', display: 'Admin', permissions: ['all'], useRoles: [] }
      store.updateRole(data)
      expect(mockCall).toHaveBeenCalledWith('admin:roles:update', data)
    })

    it('deleteRole calls gate', () => {
      store.deleteRole('r1')
      expect(mockCall).toHaveBeenCalledWith('admin:roles:delete', { _id: 'r1' })
    })

    it('syncUsers sets syncing flag and calls gate', () => {
      store.syncUsers()
      expect(store.syncing).toBe(true)
      expect(mockCall).toHaveBeenCalledWith('admin:sync-users')
    })

    it('sync-users-complete clears syncing flag', () => {
      // Re-init to get fresh mockOn calls after the beforeEach clearAllMocks
      setActivePinia(createPinia())
      const freshStore = useAdminStore()
      freshStore.init()
      const completeHandler = mockOn.mock.calls.find((c: any) => c[0] === 'admin:sync-users-complete')![1]
      freshStore.syncing = true
      completeHandler()
      expect(freshStore.syncing).toBe(false)
    })

    it('sync-users-stopped clears syncing flag', () => {
      setActivePinia(createPinia())
      const freshStore = useAdminStore()
      freshStore.init()
      const stoppedHandler = mockOn.mock.calls.find((c: any) => c[0] === 'admin:sync-users-stopped')![1]
      freshStore.syncing = true
      stoppedHandler()
      expect(freshStore.syncing).toBe(false)
    })

    it('createSetting calls gate', () => {
      const data = { name: 'theme', display: 'Theme', type: 'text', value: 'dark' }
      store.createSetting(data)
      expect(mockCall).toHaveBeenCalledWith('admin:settings:create', data)
    })

    it('updateSetting calls gate', () => {
      store.updateSetting('s1', 'new-value')
      expect(mockCall).toHaveBeenCalledWith('admin:settings:update', { _id: 's1', value: 'new-value' })
    })

    it('deleteSetting calls gate', () => {
      store.deleteSetting('s1')
      expect(mockCall).toHaveBeenCalledWith('admin:settings:delete', { _id: 's1' })
    })
  })
})
