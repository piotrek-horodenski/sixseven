import type pl from '../pl/admin'

// Wypełnia Agent B — parytet kluczy z pl wymusza typ.
const admin: typeof pl = {
  breadcrumbRoot: 'Admin',
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',

  // Lista użytkowników
  searchUsers: 'Search users...',
  sync: 'Sync',
  username: 'Username',
  email: 'Email',
  none: 'none',
  remove: 'Remove',
  noUserMatches: 'No user matches given criteria',
  confirm: 'Confirm',
  confirmDeleteUser: 'Are you sure you want to delete this user?',
  yesDelete: 'Yes, delete',

  // Lista ról
  searchRoles: 'Search roles...',
  newRole: 'New Role',
  role: 'Role',
  permissions: 'Permissions',
  inherits: 'Inherits',
  noRoleMatches: 'No role matches given criteria',
  confirmDeleteRole: 'Are you sure you want to delete this role?',

  // Panel edycji roli
  editRole: 'Edit Role',
  create: 'Create',
  name: 'Name',
  display: 'Display',
  roleNamePlaceholder: 'role-name',
  displayNamePlaceholder: 'Display Name',
  directPermissions: 'Direct Permissions',
  inheritFromRoles: 'Inherit from Roles',
  effectivePermissions: 'Effective Permissions',
  noPermissions: 'No permissions',
  inherited: 'inherited',

  // Panel edycji użytkownika
  editUserRoles: 'Edit User Roles',
  displayName: 'Display Name',
  inheritedRoles: 'Inherited Roles',
  userNotFound: 'User not found',

  // Moderacja katalogu gier (4d)
  games: 'Games',
  gamesIntro: 'External games approval',
  gamesPendingTitle: 'Pending approval',
  gamesAllTitle: 'All external games',
  gameName: 'Name',
  gameSlug: 'Slug',
  gameDev: 'Developer',
  gameStatus: 'Status',
  gameVersion: 'Version',
  gameUiUrl: 'UI',
  approve: 'Approve',
  unpublish: 'Unpublish',
  noPendingGames: 'No games pending approval.',
  noExternalGames: 'No external games registered.',
  gameStatuses: {
    registered: 'pending',
    published: 'published',
    unpublished: 'unpublished',
  },
}

export default admin
