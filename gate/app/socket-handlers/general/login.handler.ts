import * as bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { SettingsService } from '../../settings.service'

export const loginHandler: HandlerObject = {
  event: 'login',
  handler: async (socket: AuthenticatedSocket, { email, password }: { email: string, password: string }) => {
    const LoggedUser = socket.user

    if (!!LoggedUser) {
      return
    }

    const UserModel = App.models.find(item => item.name === 'users')?.model
    if (!UserModel) return

    const User = await UserModel.findOne({
      $or: [{
        email,
      }, {
        username: email,
      }],
    })

    if (!User) {
      socket.emit('login-stopped', {
        message: 'incorect credentials',
      })
      return
    }

    const isLoggedIn = await bcrypt.compare(password, User.password)

    if (!isLoggedIn) {
      socket.emit('login-stopped', {
        message: 'incorect credentials',
      })
      return
    }

    const settings = SettingsService()
    const token = jwt.sign(
      { _id: String(User._id), username: User.username, email: User.email },
      settings.jwtSecret,
      { expiresIn: settings.jwtExpiresIn as any },
    )

    // Wielotokenowe sesje: DOPISZ nową sesję (nie nadpisuj innych urządzeń).
    // `token` (pole legacy) trzymamy dla zgodności wstecznej — źródłem prawdy
    // przy weryfikacji jest `sessions.token`.
    const userAgent = (socket.handshake?.headers?.['user-agent'] as string | undefined) ?? ''
    const sessions = Array.isArray((User as any).sessions) ? (User as any).sessions : []
    ;(User as any).sessions = [...sessions, { token, createdAt: Date.now(), userAgent }]
    User.token = token
    await User.save()

    socket.emit('login-complete', {
      _id: User._id,
      username: User.username,
      email: User.email,
      profile: User.profile,
      permissions: User.permissions,
      token,
    })
  }
}
