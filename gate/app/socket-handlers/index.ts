
import { Socket } from 'socket.io'

import { disconnectHandler } from './general/disconnect.handler'
import { registerHandler } from './general/register.handler'
import { loginHandler } from './general/login.handler'
import { logoutHandler } from './general/logout.handler'
import { subscribeHandler } from './general/subscribe.handler'
import { unsubscribeHandler } from './general/unsubscribe.handler'
import { settingsPublicHandler } from './general/settings-public.handler'
import { profileUpdateHandler, changePasswordHandler } from './general/profile.handler'
import { adminHandlers } from './admin'
import { engineHandlers } from './engines'
import { conceptHandlers } from './concepts'
import { projectHandlers } from './projects'
import { colorPresetHandlers } from './color-presets'

export interface AuthenticatedSocket extends Socket {
  user?: {
    _id: string
    username: string
    email: string
    password: string
    token: string | null
    profile: Record<string, unknown>
    permissions: string[]
    roles: string[]
    allRoles: string[]
    save: () => Promise<unknown>
  } | null
}

export interface HandlerObject {
  event: string
  handler: (socket: AuthenticatedSocket, ...args: any[]) => void | Promise<void>
}

export const socketHandlers: HandlerObject[] = [
  disconnectHandler,
  registerHandler,
  loginHandler,
  logoutHandler,
  subscribeHandler,
  unsubscribeHandler,
  settingsPublicHandler,
  profileUpdateHandler,
  changePasswordHandler,
  ...adminHandlers,
  ...engineHandlers,
  ...conceptHandlers,
  ...projectHandlers,
  ...colorPresetHandlers,
]
