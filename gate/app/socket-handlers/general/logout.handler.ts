import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const logoutHandler: HandlerObject = {
  event: 'logout',
  handler: async (socket: AuthenticatedSocket) => {
    const LoggedUser = socket.user

    Object.assign(socket, { user: null })

    if (!LoggedUser) {
      return
    }

    App.subManager.unsubscribe(LoggedUser._id, [])

    const UserModel = App.models.find(item => item.name === 'users')?.model
    if (!UserModel) return

    const User = await UserModel.findOne({
      _id: LoggedUser._id,
    })

    if (!User) {
      socket.emit('logout-complete', {
        _id: LoggedUser._id,
      })
      return
    }

    // Usuń TYLKO bieżącą sesję (po tokenie tego socketu) — inne urządzenia
    // pozostają zalogowane. Fallback do pola legacy `token`, gdy socket nie niesie
    // tokenu w handshake (np. testy jednostkowe).
    const currentToken = (socket.handshake?.auth?.token as string | undefined) ?? (User as any).token ?? null
    const sessions = Array.isArray((User as any).sessions) ? (User as any).sessions : []
    ;(User as any).sessions = sessions.filter((s: any) => s.token !== currentToken)
    if ((User as any).token === currentToken) {
      User.token = null
    }
    await User.save()

    socket.emit('logout-complete', {
      _id: LoggedUser._id,
    })
  }
}
