import { App } from '../app'
import logger from '../logger'
import { syncAllUsers } from './sync-users.service'

// sixseven RBAC. Uprawnienia gry są bazowe (etap 0) — pełny zestaw
// (rejestracja z pipeline, trust, moderacja katalogu, hosting UI) dochodzi
// w etapach 4–5 wg IMPLEMENTATION_PLAN.md.
export const defaultPermissions = [
  // Admin
  { name: 'manage-users', display: 'Manage Users', group: 'admin' },
  { name: 'manage-roles', display: 'Manage Roles', group: 'admin' },
  { name: 'manage-settings', display: 'Manage Settings', group: 'admin' },
  { name: 'view-admin', display: 'View Admin', group: 'admin' },
  // Games (platforma gier turowych)
  { name: 'play-games', display: 'Play Games', group: 'games' },
  { name: 'register-games', display: 'Register Games', group: 'games' },
  { name: 'manage-games', display: 'Manage Games', group: 'games' },
  // Images (serwis mediów platformy)
  { name: 'access-images', display: 'Access Images', group: 'images' },
  { name: 'control-images', display: 'Control Images', group: 'images' },
  { name: 'can-admin-images', display: 'Admin Images', group: 'images' },
]

export const defaultRoles = [
  {
    name: 'guest',
    display: 'Guest',
    permissions: [] as string[],
    useRoles: [] as string[],
  },
  {
    name: 'player',
    display: 'Gracz',
    permissions: ['play-games', 'access-images'],
    useRoles: ['guest'],
  },
  {
    name: 'developer',
    display: 'Deweloper',
    permissions: ['register-games'],
    useRoles: ['player'],
  },
  {
    name: 'admin',
    display: 'Administrator',
    permissions: [
      'manage-users', 'manage-roles', 'manage-settings', 'view-admin',
      'manage-games',
      'can-admin-images', 'control-images', 'access-images',
    ],
    useRoles: ['developer'],
  },
]

export const defaultSettings = [
  { name: 'register', display: 'Allow Registration', type: 'boolean', value: true },
  { name: 'admin-first', display: 'First User is Admin', type: 'boolean', value: true },
  { name: 'notify-endpoint', display: 'Notify Endpoint', type: 'text', value: '' },
  { name: 'images-api-url', display: 'Images API URL', type: 'text', value: '' },
]

async function upsertCollection(
  Model: any,
  defaults: { name: string;[key: string]: any }[],
  label: string,
): Promise<void> {
  const existing = await Model.find({}, { name: 1 }).lean()
  const existingNames = new Set(existing.map((d: any) => d.name))
  const toInsert = defaults.filter(d => !existingNames.has(d.name))

  if (toInsert.length > 0) {
    await Model.insertMany(toInsert)
    logger.info({ count: toInsert.length, label }, 'seeded missing documents')
  }
}

async function syncRolePermissions(RoleModel: any): Promise<void> {
  for (const def of defaultRoles) {
    const existing = await RoleModel.findOne({ name: def.name }).lean()
    if (!existing) continue

    const currentPerms: string[] = existing.permissions || []
    const missingPerms = def.permissions.filter((p: string) => !currentPerms.includes(p))

    if (missingPerms.length > 0) {
      await RoleModel.updateOne(
        { name: def.name },
        { $addToSet: { permissions: { $each: missingPerms } } },
      )
      logger.info({ role: def.name, added: missingPerms }, 'synced missing permissions to role')
    }
  }
}

export async function seed(): Promise<void> {
  const PermissionModel = App.models.find(m => m.name === 'permissions')?.model
  const RoleModel = App.models.find(m => m.name === 'roles')?.model
  const SettingModel = App.models.find(m => m.name === 'settings')?.model

  if (!PermissionModel || !RoleModel || !SettingModel) {
    logger.warn('seed: missing models, skipping')
    return
  }

  await Promise.all([
    upsertCollection(PermissionModel, defaultPermissions, 'permissions'),
    upsertCollection(RoleModel, defaultRoles, 'roles'),
    upsertCollection(SettingModel, defaultSettings, 'settings'),
  ])

  await syncRolePermissions(RoleModel)
  await syncAllUsers()
}
