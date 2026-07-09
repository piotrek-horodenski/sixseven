import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// SocketSimulator must be imported after mocks are set up, but we need
// a stable reference for the mock factory. Use vi.hoisted to create a
// container that both the mock and the test code can reference.
const { socketRef } = vi.hoisted(() => {
  const socketRef: { current: any } = { current: null }
  return { socketRef }
})

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketRef.current),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

import { SocketSimulator } from '../helpers/socket-simulator'

let simulator: SocketSimulator

import { useGateStore } from '@/stores/gate/gate.store'
import { useAdminStore } from '@/stores/admin/admin.store'

const defaultPermissions = [
  { _id: 'p1', name: 'manage-users', display: 'Manage Users', group: 'admin' },
  { _id: 'p2', name: 'manage-roles', display: 'Manage Roles', group: 'admin' },
  { _id: 'p3', name: 'manage-settings', display: 'Manage Settings', group: 'admin' },
  { _id: 'p4', name: 'view-admin', display: 'View Admin', group: 'admin' },
  { _id: 'p5', name: 'access-images', display: 'Access Images', group: 'images' },
  { _id: 'p6', name: 'manage-engines', display: 'Manage Engines', group: 'unreal' },
  { _id: 'p7', name: 'control-unreal-projects', display: 'Control Unreal', group: 'unreal' },
]

const defaultRoles = [
  { _id: 'r1', name: 'admin', display: 'Administrator', permissions: ['manage-users', 'manage-roles', 'manage-settings', 'view-admin'], useRoles: ['ue-creator'] },
  { _id: 'r2', name: 'ue-creator', display: 'UE Creator', permissions: ['manage-engines', 'control-unreal-projects'], useRoles: ['ue-viewer'] },
  { _id: 'r3', name: 'ue-viewer', display: 'UE Viewer', permissions: ['access-images'], useRoles: [] },
  { _id: 'r4', name: 'guest', display: 'Guest', permissions: [], useRoles: [] },
]

const defaultUsers = [
  { _id: 'u1', username: 'alice', email: 'alice@test.com', roles: ['admin'], permissions: ['manage-users', 'manage-roles', 'manage-settings', 'view-admin', 'manage-engines', 'control-unreal-projects', 'access-images'] },
  { _id: 'u2', username: 'bob', email: 'bob@test.com', roles: ['ue-viewer'], permissions: ['access-images'] },
  { _id: 'u3', username: 'carol', email: 'carol@test.com', roles: ['guest'], permissions: [] },
]

function setupStores() {
  const gate = useGateStore()
  const admin = useAdminStore()

  gate.user = { _id: 'u1', username: 'admin', permissions: ['manage-users', 'manage-roles', 'manage-settings', 'view-admin'] }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'

  // Connect and simulate socket
  gate.connect()
  simulator.connect()

  // Initialize admin store
  admin.init()

  // Simulate server sending initial data
  simulator.simulate('collection-init', 'users', [...defaultUsers])
  simulator.simulate('collection-init', 'roles', [...defaultRoles])
  simulator.simulate('collection-init', 'permissions', [...defaultPermissions])
  simulator.simulate('collection-init', 'settings', [])

  return { gate, admin }
}

describe('admin roles and sync integration', () => {
  beforeEach(() => {
    simulator = new SocketSimulator()
    socketRef.current = simulator.socket
    setActivePinia(createPinia())
  })

  describe('role editing flow', () => {
    it('creates a new role with permissions', () => {
      const { admin } = setupStores()

      // Create a new role
      admin.createRole({
        name: 'editor',
        display: 'Editor',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      const emitted = simulator.getEmitted('admin:roles:create')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({
        name: 'editor',
        display: 'Editor',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      // Simulate server confirming creation
      simulator.simulate('collection-add', 'roles', {
        _id: 'r5',
        name: 'editor',
        display: 'Editor',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      expect(admin.roles).toHaveLength(5)
      expect(admin.roles.find((r: any) => r.name === 'editor')).toBeDefined()
    })

    it('updates an existing role permissions', () => {
      const { admin } = setupStores()

      // Update ue-viewer to also have manage-engines
      admin.updateRole({
        _id: 'r3',
        display: 'UE Viewer+',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      const emitted = simulator.getEmitted('admin:roles:update')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({
        _id: 'r3',
        display: 'UE Viewer+',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      // Simulate server update
      simulator.simulate('collection-update', 'roles', {
        _id: 'r3',
        name: 'ue-viewer',
        display: 'UE Viewer+',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      const updated = admin.roles.find((r: any) => r._id === 'r3')
      expect(updated.display).toBe('UE Viewer+')
      expect(updated.permissions).toContain('manage-engines')
    })

    it('edits multiple roles in sequence', () => {
      const { admin } = setupStores()

      // Edit role 1
      admin.updateRole({ _id: 'r1', display: 'Super Admin', permissions: ['manage-users', 'manage-roles', 'view-admin'], useRoles: ['ue-creator'] })
      simulator.simulate('collection-update', 'roles', { _id: 'r1', name: 'admin', display: 'Super Admin', permissions: ['manage-users', 'manage-roles', 'view-admin'], useRoles: ['ue-creator'] })

      // Edit role 2
      admin.updateRole({ _id: 'r4', display: 'Limited Guest', permissions: ['access-images'], useRoles: [] })
      simulator.simulate('collection-update', 'roles', { _id: 'r4', name: 'guest', display: 'Limited Guest', permissions: ['access-images'], useRoles: [] })

      const emitted = simulator.getEmitted('admin:roles:update')
      expect(emitted).toHaveLength(2)
      expect(emitted[0][0]._id).toBe('r1')
      expect(emitted[1][0]._id).toBe('r4')

      expect(admin.roles.find((r: any) => r._id === 'r1').display).toBe('Super Admin')
      expect(admin.roles.find((r: any) => r._id === 'r4').display).toBe('Limited Guest')
    })

    it('deletes a role', () => {
      const { admin } = setupStores()

      admin.deleteRole('r4')

      const emitted = simulator.getEmitted('admin:roles:delete')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({ _id: 'r4' })

      simulator.simulate('collection-delete', 'roles', 'r4')
      expect(admin.roles).toHaveLength(3)
      expect(admin.roles.find((r: any) => r._id === 'r4')).toBeUndefined()
    })
  })

  describe('user role assignment', () => {
    it('updates user roles', () => {
      const { admin } = setupStores()

      admin.updateUserRoles('u3', ['ue-viewer', 'guest'])

      const emitted = simulator.getEmitted('admin:users:update-roles')
      expect(emitted).toHaveLength(1)
      expect(emitted[0][0]).toEqual({ userId: 'u3', roles: ['ue-viewer', 'guest'] })

      // Simulate server updating user
      simulator.simulate('collection-update', 'users', {
        _id: 'u3',
        username: 'carol',
        email: 'carol@test.com',
        roles: ['ue-viewer', 'guest'],
        permissions: ['access-images'],
      })

      const carol = admin.users.find((u: any) => u._id === 'u3')
      expect(carol.roles).toEqual(['ue-viewer', 'guest'])
      expect(carol.permissions).toContain('access-images')
    })

    it('removes all roles from user', () => {
      const { admin } = setupStores()

      admin.updateUserRoles('u2', [])

      simulator.simulate('collection-update', 'users', {
        _id: 'u2',
        username: 'bob',
        email: 'bob@test.com',
        roles: [],
        permissions: [],
      })

      const bob = admin.users.find((u: any) => u._id === 'u2')
      expect(bob.roles).toEqual([])
      expect(bob.permissions).toEqual([])
    })
  })

  describe('sync users', () => {
    it('triggers sync and completes', () => {
      const { admin } = setupStores()

      admin.syncUsers()

      expect(admin.syncing).toBe(true)
      const emitted = simulator.getEmitted('admin:sync-users')
      expect(emitted).toHaveLength(1)

      // Server responds: sync complete
      simulator.simulate('admin:sync-users-complete')
      expect(admin.syncing).toBe(false)
    })

    it('handles sync failure', () => {
      const { admin } = setupStores()

      admin.syncUsers()
      expect(admin.syncing).toBe(true)

      simulator.simulate('admin:sync-users-stopped')
      expect(admin.syncing).toBe(false)
    })

    it('sync updates user data when server pushes collection-update', () => {
      const { admin } = setupStores()

      admin.syncUsers()

      // Server syncs and pushes updated user data
      simulator.simulate('admin:sync-users-complete')

      // Simulate server pushing updated permissions after role changes propagated
      simulator.simulate('collection-update', 'users', {
        _id: 'u2',
        username: 'bob',
        email: 'bob@test.com',
        roles: ['ue-viewer'],
        permissions: ['access-images', 'manage-engines'],
      })

      const bob = admin.users.find((u: any) => u._id === 'u2')
      expect(bob.permissions).toContain('manage-engines')
    })
  })

  describe('role + sync combined flow', () => {
    it('edit role then sync propagates permissions to users', () => {
      const { admin } = setupStores()

      // Step 1: Update ue-viewer role to add manage-engines
      admin.updateRole({
        _id: 'r3',
        display: 'UE Viewer',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      simulator.simulate('collection-update', 'roles', {
        _id: 'r3',
        name: 'ue-viewer',
        display: 'UE Viewer',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      // Step 2: Sync users to propagate changes
      admin.syncUsers()

      const syncEmitted = simulator.getEmitted('admin:sync-users')
      expect(syncEmitted).toHaveLength(1)

      simulator.simulate('admin:sync-users-complete')

      // Step 3: Server pushes updated bob (who has ue-viewer)
      simulator.simulate('collection-update', 'users', {
        _id: 'u2',
        username: 'bob',
        email: 'bob@test.com',
        roles: ['ue-viewer'],
        permissions: ['access-images', 'manage-engines'],
      })

      const bob = admin.users.find((u: any) => u._id === 'u2')
      expect(bob.permissions).toEqual(['access-images', 'manage-engines'])
    })

    it('create role, assign to user, then sync', () => {
      const { admin } = setupStores()

      // Create new role
      admin.createRole({
        name: 'moderator',
        display: 'Moderator',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      simulator.simulate('collection-add', 'roles', {
        _id: 'r5',
        name: 'moderator',
        display: 'Moderator',
        permissions: ['access-images', 'manage-engines'],
        useRoles: [],
      })

      // Assign moderator to carol
      admin.updateUserRoles('u3', ['moderator'])

      simulator.simulate('collection-update', 'users', {
        _id: 'u3',
        username: 'carol',
        email: 'carol@test.com',
        roles: ['moderator'],
        permissions: ['access-images', 'manage-engines'],
      })

      // Sync to verify
      admin.syncUsers()
      simulator.simulate('admin:sync-users-complete')

      const carol = admin.users.find((u: any) => u._id === 'u3')
      expect(carol.roles).toEqual(['moderator'])
      expect(carol.permissions).toContain('access-images')
      expect(carol.permissions).toContain('manage-engines')
    })
  })

  describe('cleanup', () => {
    it('cleanup resets all admin data and unsubscribes', () => {
      const { admin } = setupStores()

      expect(admin.users.length).toBeGreaterThan(0)
      expect(admin.roles.length).toBeGreaterThan(0)

      admin.cleanup()

      expect(admin.users).toEqual([])
      expect(admin.roles).toEqual([])
      expect(admin.permissions).toEqual([])
      expect(admin.settings).toEqual([])
      expect(admin.subscribed).toBe(false)

      const unsubEmitted = simulator.getEmitted('unsubscribe')
      expect(unsubEmitted.length).toBeGreaterThan(0)
    })
  })
})
