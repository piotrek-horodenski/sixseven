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


    User.token = null
    await User.save()

    socket.emit('logout-complete', {
      _id: LoggedUser._id,
    })
  }
}
