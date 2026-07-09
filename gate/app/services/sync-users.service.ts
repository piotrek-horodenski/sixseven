import { App } from '../app'
import logger from '../logger'
import { AuthenticatedSocket } from '../socket-handlers'

interface RoleDef {
  _id: string
  name: string
  permissions: string[]
  useRoles: string[]
}

function getRoles(roleName: string, allRoleDefs: RoleDef[], visited: Set<string> = new Set()): string[] {
  if (visited.has(roleName)) return []
  visited.add(roleName)

  const roleDef = allRoleDefs.find(r => r.name === roleName)
  if (!roleDef) return [roleName]

  const inherited = roleDef.useRoles.reduce<string[]>((acc, childName) => {
    const childRoles = getRoles(childName, allRoleDefs, visited)
    childRoles.forEach(r => {
      if (!acc.includes(r)) acc.push(r)
    })
    return acc
  }, [])

  return [roleName, ...inherited]
}

function getAllRoles(userRoleNames: string[], allRoleDefs: RoleDef[]): string[] {
  const result: string[] = []
  for (const roleName of userRoleNames) {
    const expanded = getRoles(roleName, allRoleDefs, new Set())
    for (const r of expanded) {
      if (!result.includes(r)) result.push(r)
    }
  }
  return result
}

function getPermissions(allRoleNames: string[], allRoleDefs: RoleDef[]): string[] {
  const result: string[] = []
  for (const roleName of allRoleNames) {
    const roleDef = allRoleDefs.find(r => r.name === roleName)
    if (!roleDef) continue
    for (const perm of roleDef.permissions) {
      if (!result.includes(perm)) result.push(perm)
    }
  }
  return result
}

export async function syncUser(userId: string): Promise<void> {
  const UserModel = App.models.find(m => m.name === 'users')?.model
  const RoleModel = App.models.find(m => m.name === 'roles')?.model
  if (!UserModel || !RoleModel) return

  const user = await UserModel.findById(userId)
  if (!user) return

  const allRoleDefs = await RoleModel.find({}).lean() as unknown as RoleDef[]
  const userRoles: string[] = (user as any).roles || []

  const allRoles = getAllRoles(userRoles, allRoleDefs)
  const permissions = getPermissions(allRoles, allRoleDefs)

  await UserModel.updateOne({ _id: userId }, {
    $set: { allRoles, permissions },
  })

  refreshSocketPermissions(userId, permissions, userRoles, allRoles)

  logger.debug({ userId, allRoles, permissions }, 'synced user permissions')
}

export async function syncAllUsers(): Promise<void> {
  const UserModel = App.models.find(m => m.name === 'users')?.model
  const RoleModel = App.models.find(m => m.name === 'roles')?.model
  if (!UserModel || !RoleModel) return

  const allRoleDefs = await RoleModel.find({}).lean() as unknown as RoleDef[]
  const users = await UserModel.find({})

  for (const user of users) {
    const userRoles: string[] = (user as any).roles || []
    const allRoles = getAllRoles(userRoles, allRoleDefs)
    const permissions = getPermissions(allRoles, allRoleDefs)

    await UserModel.updateOne({ _id: user._id }, {
      $set: { allRoles, permissions },
    })

    refreshSocketPermissions(String(user._id), permissions, userRoles, allRoles)
  }

  logger.info({ userCount: users.length }, 'synced all users permissions')
}

function refreshSocketPermissions(
  userId: string,
  permissions: string[],
  roles: string[],
  allRoles: string[],
): void {
  if (!App.io) return

  for (const [, socket] of App.io.sockets.sockets) {
    const authSocket = socket as unknown as AuthenticatedSocket
    if (authSocket.user && String(authSocket.user._id) === userId) {
      authSocket.user.permissions = permissions
      authSocket.user.roles = roles
      authSocket.user.allRoles = allRoles
    }
  }
}

// Exported for testing
export { getRoles, getAllRoles, getPermissions }
