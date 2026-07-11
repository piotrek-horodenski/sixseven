import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const unsubscribeHandler: HandlerObject = {
  event: 'unsubscribe',
  handler: async (socket: AuthenticatedSocket, { collections }: { collections: string[] }) => {
    const User = socket.user

    if (!User) {
      return
    }

    // Socket-scoped so one device unsubscribing does not cut off the user's
    // other devices (multi-device correctness).
    App.subManager.unsubscribeSocket(String(User._id), socket.id, collections)
  }
}
