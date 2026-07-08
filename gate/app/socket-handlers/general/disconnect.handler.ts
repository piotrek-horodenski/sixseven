import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const disconnectHandler: HandlerObject = {
  event: 'disconnect',
  handler: (socket: AuthenticatedSocket) => {
    const User = socket.user
    if (!User) {
      return
    }
    App.subManager.unsubscribe(User._id, [])
  }
}
