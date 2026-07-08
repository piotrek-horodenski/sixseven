import * as bcrypt from 'bcrypt'

import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { syncUser } from '../../services/sync-users.service'
import logger from '../../logger'

export const registerHandler: HandlerObject = {
  event: 'register',
  handler: async (socket: AuthenticatedSocket, { email, username, password }: { email: string, username: string, password: string }) => {
    logger.info({ socketId: socket.id, username }, 'register attempt')
    const LoggedUser = socket.user

    if (LoggedUser) {
      return
    }

    const UserModel = App.models.find(item => item.name === 'users')?.model
    if (!UserModel) return

    const SettingModel = App.models.find(item => item.name === 'settings')?.model
    const [settingsDocs, existingUserCount] = await Promise.all([
      SettingModel ? SettingModel.find({ name: { $in: ['register', 'admin-first'] } }).lean() : [],
      UserModel.countDocuments(),
    ])
    const settingsMap = new Map((settingsDocs as any[]).map((s: any) => [s.name, s.value]))

    if (settingsMap.get('register') === false && existingUserCount > 0) {
      socket.emit('register-stopped', { message: 'registration is disabled' })
      return
    }

    const existing = await UserModel.findOne({
      $or: [{
        email,
      }, {
        username,
      }],
    })

    if (existing) {
      socket.emit('register-stopped', {
        message: 'username or email already in use',
      })
      return
    }

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)

    // Determine initial role: admin for first user (if admin-first enabled), otherwise guest
    const adminFirstSetting = settingsDocs.find((s: any) => s.name === 'admin-first') as any
    const isFirstAdmin = adminFirstSetting?.value === true && existingUserCount === 0
    const initialRoles = isFirstAdmin ? ['admin'] : ['guest']

    const User = new UserModel({
      username,
      email,
      password: hash,
      profile: {
        display: username,
        type: 'regular',
        status: '',
      },
      roles: initialRoles,
      permissions: [],
      allRoles: [],
    })

    let result
    try {
      result = await User.save()
    } catch (err: any) {
      if (err.code === 11000) {
        socket.emit('register-stopped', {
          message: 'username or email already in use',
        })
        return
      }
      throw err
    }

    // Sync permissions from assigned role(s)
    await syncUser(String(result._id))

    if (isFirstAdmin) {
      logger.info({ userId: result._id, username }, 'first user assigned admin role')
    }

    result = await UserModel.findById(result._id)
    socket.emit('register-complete', result)
  }
}
