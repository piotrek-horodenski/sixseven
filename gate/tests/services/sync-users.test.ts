import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFind, mockFindById, mockUpdateOne, mockRoleFind } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockFindById: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockRoleFind: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'users', model: { find: mockFind, findById: mockFindById, updateOne: mockUpdateOne } },
      { name: 'roles', model: { find: mockRoleFind } },
    ],
    io: { sockets: { sockets: new Map() } },
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getRoles, getAllRoles, getPermissions, syncUser, syncAllUsers } from '../../app/services/sync-users.service'

describe('sync-users.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRoles', () => {
    const roleDefs = [
      { _id: '1', name: 'admin', permissions: ['manage-roles'], useRoles: ['editor'] },
      { _id: '2', name: 'editor', permissions: ['use-desktop'], useRoles: ['guest'] },
      { _id: '3', name: 'guest', permissions: ['access-desktop'], useRoles: [] },
    ]

    it('expands a role through its useRoles chain', () => {
      const result = getRoles('admin', roleDefs)
      expect(result).toEqual(['admin', 'editor', 'guest'])
    })

    it('returns just the role name if role has no useRoles', () => {
      const result = getRoles('guest', roleDefs)
      expect(result).toEqual(['guest'])
    })

    it('returns just the role name if role is not found in defs', () => {
      const result = getRoles('unknown', roleDefs)
      expect(result).toEqual(['unknown'])
    })

    it('handles circular useRoles without infinite loop', () => {
      const circular = [
        { _id: '1', name: 'a', permissions: [], useRoles: ['b'] },
        { _id: '2', name: 'b', permissions: [], useRoles: ['a'] },
      ]
      const result = getRoles('a', circular)
      expect(result).toContain('a')
      expect(result).toContain('b')
      expect(result.length).toBe(2)
    })

    it('handles self-referencing role', () => {
      const selfRef = [
        { _id: '1', name: 'loop', permissions: ['x'], useRoles: ['loop'] },
      ]
      const result = getRoles('loop', selfRef)
      expect(result).toEqual(['loop'])
    })
  })

  describe('getAllRoles', () => {
    const roleDefs = [
      { _id: '1', name: 'admin', permissions: ['manage-roles'], useRoles: ['editor'] },
      { _id: '2', name: 'editor', permissions: ['use-desktop'], useRoles: ['guest'] },
      { _id: '3', name: 'guest', permissions: ['access-desktop'], useRoles: [] },
      { _id: '4', name: 'viewer', permissions: ['view'], useRoles: ['guest'] },
    ]

    it('expands multiple roles and deduplicates', () => {
      const result = getAllRoles(['admin', 'viewer'], roleDefs)
      expect(result).toContain('admin')
      expect(result).toContain('editor')
      expect(result).toContain('guest')
      expect(result).toContain('viewer')
      // guest should appear only once
      expect(result.filter(r => r === 'guest').length).toBe(1)
    })

    it('returns empty array for empty input', () => {
      expect(getAllRoles([], roleDefs)).toEqual([])
    })
  })

  describe('getPermissions', () => {
    const roleDefs = [
      { _id: '1', name: 'admin', permissions: ['manage-roles', 'manage-users'], useRoles: [] },
      { _id: '2', name: 'editor', permissions: ['use-desktop', 'manage-roles'], useRoles: [] },
    ]

    it('flattens and deduplicates permissions across roles', () => {
      const result = getPermissions(['admin', 'editor'], roleDefs)
      expect(result).toContain('manage-roles')
      expect(result).toContain('manage-users')
      expect(result).toContain('use-desktop')
      expect(result.filter(p => p === 'manage-roles').length).toBe(1)
    })

    it('skips unknown role names', () => {
      const result = getPermissions(['unknown'], roleDefs)
      expect(result).toEqual([])
    })
  })

  describe('syncUser', () => {
    it('resolves roles and updates user document', async () => {
      const roleDefs = [
        { _id: '1', name: 'editor', permissions: ['use-desktop'], useRoles: ['guest'] },
        { _id: '2', name: 'guest', permissions: ['access-desktop'], useRoles: [] },
      ]
      mockFindById.mockResolvedValue({ _id: 'u1', roles: ['editor'] })
      mockRoleFind.mockReturnValue({ lean: () => Promise.resolve(roleDefs) })
      mockUpdateOne.mockResolvedValue({})

      await syncUser('u1')

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        {
          $set: {
            allRoles: ['editor', 'guest'],
            permissions: ['use-desktop', 'access-desktop'],
          },
        },
      )
    })

    it('does nothing if user not found', async () => {
      mockFindById.mockResolvedValue(null)
      mockRoleFind.mockReturnValue({ lean: () => Promise.resolve([]) })

      await syncUser('missing')

      expect(mockUpdateOne).not.toHaveBeenCalled()
    })
  })

  describe('syncAllUsers', () => {
    it('syncs permissions for all users', async () => {
      const roleDefs = [
        { _id: '1', name: 'admin', permissions: ['manage-roles'], useRoles: [] },
      ]
      mockFind.mockResolvedValue([
        { _id: 'u1', roles: ['admin'] },
        { _id: 'u2', roles: [] },
      ])
      mockRoleFind.mockReturnValue({ lean: () => Promise.resolve(roleDefs) })
      mockUpdateOne.mockResolvedValue({})

      await syncAllUsers()

      expect(mockUpdateOne).toHaveBeenCalledTimes(2)
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { allRoles: ['admin'], permissions: ['manage-roles'] } },
      )
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'u2' },
        { $set: { allRoles: [], permissions: [] } },
      )
    })
  })
})
