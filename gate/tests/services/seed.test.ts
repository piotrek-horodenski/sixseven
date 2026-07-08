import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPermFind, mockRoleFind, mockSettingFind, mockPermInsert, mockRoleInsert, mockSettingInsert, mockRoleFindOne, mockRoleUpdateOne } = vi.hoisted(() => {
  const mockPermFind = vi.fn()
  const mockRoleFind = vi.fn()
  const mockSettingFind = vi.fn()
  const mockPermInsert = vi.fn()
  const mockRoleInsert = vi.fn()
  const mockSettingInsert = vi.fn()
  const mockRoleFindOne = vi.fn()
  const mockRoleUpdateOne = vi.fn()

  return { mockPermFind, mockRoleFind, mockSettingFind, mockPermInsert, mockRoleInsert, mockSettingInsert, mockRoleFindOne, mockRoleUpdateOne }
})

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'permissions', model: { find: mockPermFind, insertMany: mockPermInsert } },
      { name: 'roles', model: { find: mockRoleFind, insertMany: mockRoleInsert, findOne: mockRoleFindOne, updateOne: mockRoleUpdateOne } },
      { name: 'settings', model: { find: mockSettingFind, insertMany: mockSettingInsert } },
    ],
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { seed, defaultPermissions, defaultRoles, defaultSettings } from '../../app/services/seed.service'

describe('seed service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // By default, syncRolePermissions finds no existing roles (nothing to sync)
    mockRoleFindOne.mockReturnValue({ lean: () => Promise.resolve(null) })
    mockRoleUpdateOne.mockResolvedValue({})
  })

  it('inserts all defaults when collections are empty', async () => {
    mockPermFind.mockReturnValue({ lean: () => Promise.resolve([]) })
    mockRoleFind.mockReturnValue({ lean: () => Promise.resolve([]) })
    mockSettingFind.mockReturnValue({ lean: () => Promise.resolve([]) })
    mockPermInsert.mockResolvedValue([])
    mockRoleInsert.mockResolvedValue([])
    mockSettingInsert.mockResolvedValue([])

    await seed()

    expect(mockPermInsert).toHaveBeenCalledOnce()
    expect(mockRoleInsert).toHaveBeenCalledOnce()
    expect(mockSettingInsert).toHaveBeenCalledOnce()

    const perms = mockPermInsert.mock.calls[0][0]
    expect(perms).toHaveLength(defaultPermissions.length)
    expect(perms.map((p: any) => p.name)).toContain('manage-users')
    expect(perms.map((p: any) => p.name)).toContain('access-unreal-projects')
    expect(perms.map((p: any) => p.name)).toContain('access-images')

    const roles = mockRoleInsert.mock.calls[0][0]
    expect(roles).toHaveLength(defaultRoles.length)
    expect(roles.find((r: any) => r.name === 'admin').useRoles).toContain('ue-creator')
    expect(roles.find((r: any) => r.name === 'ue-operator').useRoles).toContain('ue-viewer')
    expect(roles.find((r: any) => r.name === 'guest').permissions).toHaveLength(0)

    const settings = mockSettingInsert.mock.calls[0][0]
    expect(settings).toHaveLength(defaultSettings.length)
    expect(settings.find((s: any) => s.name === 'register').value).toBe(true)
    expect(settings.find((s: any) => s.name === 'notify-endpoint').type).toBe('text')
  })

  it('only inserts missing documents when some already exist', async () => {
    mockPermFind.mockReturnValue({
      lean: () => Promise.resolve([
        { name: 'manage-users' },
        { name: 'manage-roles' },
      ]),
    })
    mockRoleFind.mockReturnValue({
      lean: () => Promise.resolve([
        { name: 'admin' },
        { name: 'guest' },
      ]),
    })
    mockSettingFind.mockReturnValue({
      lean: () => Promise.resolve([
        { name: 'register' },
        { name: 'admin-first' },
      ]),
    })
    mockPermInsert.mockResolvedValue([])
    mockRoleInsert.mockResolvedValue([])
    mockSettingInsert.mockResolvedValue([])

    await seed()

    // Should insert the missing permissions (all except manage-users, manage-roles)
    const insertedPerms = mockPermInsert.mock.calls[0][0]
    expect(insertedPerms.length).toBe(defaultPermissions.length - 2)
    expect(insertedPerms.map((p: any) => p.name)).not.toContain('manage-users')
    expect(insertedPerms.map((p: any) => p.name)).not.toContain('manage-roles')

    // Should insert missing roles
    const insertedRoles = mockRoleInsert.mock.calls[0][0]
    expect(insertedRoles.length).toBe(defaultRoles.length - 2)
    expect(insertedRoles.map((r: any) => r.name)).not.toContain('admin')
    expect(insertedRoles.map((r: any) => r.name)).not.toContain('guest')

    // Should insert missing settings
    const insertedSettings = mockSettingInsert.mock.calls[0][0]
    expect(insertedSettings.length).toBe(defaultSettings.length - 2)
    expect(insertedSettings.map((s: any) => s.name)).not.toContain('register')
    expect(insertedSettings.map((s: any) => s.name)).not.toContain('admin-first')
  })

  it('skips insert when all documents already exist', async () => {
    mockPermFind.mockReturnValue({
      lean: () => Promise.resolve(defaultPermissions.map(p => ({ name: p.name }))),
    })
    mockRoleFind.mockReturnValue({
      lean: () => Promise.resolve(defaultRoles.map(r => ({ name: r.name }))),
    })
    mockSettingFind.mockReturnValue({
      lean: () => Promise.resolve(defaultSettings.map(s => ({ name: s.name }))),
    })

    await seed()

    expect(mockPermInsert).not.toHaveBeenCalled()
    expect(mockRoleInsert).not.toHaveBeenCalled()
    expect(mockSettingInsert).not.toHaveBeenCalled()
  })
})
