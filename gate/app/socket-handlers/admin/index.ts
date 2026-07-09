import { HandlerObject } from '..'

import { updateUserRolesHandler, deleteUserHandler } from './users.handler'
import { createRoleHandler, updateRoleHandler, deleteRoleHandler, syncUsersHandler } from './roles.handler'
import { createSettingHandler, updateSettingHandler, deleteSettingHandler } from './settings.handler'

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
]
