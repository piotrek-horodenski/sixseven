import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const disconnectHandler: HandlerObject = {
  event: 'disconnect',
  handler: (socket: AuthenticatedSocket) => {
    const User = socket.user
    if (!User) {
      return
    }
    // Multi-device: only tear down THIS socket's subscriptions, not the user's
    // other devices.
    App.subManager.unsubscribeSocket(User._id, socket.id, [])
  }
}
