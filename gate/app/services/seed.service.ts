import { App } from '../app'
import logger from '../logger'
import { syncAllUsers } from './sync-users.service'

export const defaultPermissions = [
  // Admin
  { name: 'manage-users', display: 'Manage Users', group: 'admin' },
  { name: 'manage-roles', display: 'Manage Roles', group: 'admin' },
  { name: 'manage-settings', display: 'Manage Settings', group: 'admin' },
  { name: 'view-admin', display: 'View Admin', group: 'admin' },
  // Unreal
  { name: 'access-unreal-projects', display: 'Access Unreal Projects', group: 'unreal' },
  { name: 'edit-unreal-projects', display: 'Edit Unreal Projects', group: 'unreal' },
  { name: 'control-unreal-projects', display: 'Control Unreal Projects', group: 'unreal' },
  { name: 'load-and-clear-unreal-projects', display: 'Load & Clear Unreal Projects', group: 'unreal' },
  { name: 'configure-unreal-studio', display: 'Configure Unreal Studio', group: 'unreal' },
  { name: 'access-unreal-boards', display: 'Access Unreal Boards', group: 'unreal' },
  { name: 'git-unreal', display: 'Git Unreal', group: 'unreal' },
  // Images
  { name: 'access-images', display: 'Access Images', group: 'images' },
  { name: 'control-images', display: 'Control Images', group: 'images' },
  { name: 'can-admin-images', display: 'Admin Images', group: 'images' },
  // Engines
  { name: 'manage-engines', display: 'Manage Engines', group: 'engines' },
  { name: 'view-engines', display: 'View Engines', group: 'engines' },
]

export const defaultRoles = [
  {
    name: 'guest',
    display: 'Guest',
    permissions: [] as string[],
    useRoles: [] as string[],
  },
  {
    name: 'ue-viewer',
    display: 'UE Viewer',
    permissions: ['access-unreal-projects'],
    useRoles: ['guest'],
  },
  {
    name: 'ue-images',
    display: 'UE Images',
    permissions: ['access-images', 'control-images'],
    useRoles: ['guest'],
  },
  {
    name: 'ue-operator',
    display: 'UE Operator',
    permissions: ['control-unreal-projects'],
    useRoles: ['ue-viewer'],
  },
  {
    name: 'ue-operator-max',
    display: 'UE Operator Max',
    permissions: ['control-unreal-projects', 'load-and-clear-unreal-projects'],
    useRoles: ['ue-viewer'],
  },
  {
    name: 'ue-studio-manager',
    display: 'UE Studio Manager',
    permissions: ['configure-unreal-studio', 'access-unreal-boards', 'git-unreal', 'manage-engines'],
    useRoles: ['ue-operator-max'],
  },
  {
    name: 'ue-creator',
    display: 'UE Creator',
    permissions: ['configure-unreal-studio', 'edit-unreal-projects', 'git-unreal'],
    useRoles: ['ue-images', 'ue-operator', 'ue-studio-manager'],
  },
  {
    name: 'admin',
    display: 'Administrator',
    permissions: [
      'manage-users', 'manage-roles', 'manage-settings', 'view-admin',
      'can-admin-images', 'control-images', 'access-images',
      'manage-engines', 'view-engines',
    ],
    useRoles: ['ue-creator'],
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
