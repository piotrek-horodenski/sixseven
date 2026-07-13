import { HandlerObject } from '..'

import { updateUserRolesHandler, deleteUserHandler } from './users.handler'
import { createRoleHandler, updateRoleHandler, deleteRoleHandler, syncUsersHandler } from './roles.handler'
import { createSettingHandler, updateSettingHandler, deleteSettingHandler } from './settings.handler'
import { createAdminGamesHandlers } from './games.handler'
import { lazyClient } from '../games'

export const adminHandlers: HandlerObject[] = [
  updateUserRolesHandler,
  deleteUserHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  syncUsersHandler,
  createSettingHandler,
  updateSettingHandler,
  deleteSettingHandler,
  // Moderacja katalogu gier (4d) — ten sam leniwy klient games co komendy gry.
  ...createAdminGamesHandlers(lazyClient),
]
