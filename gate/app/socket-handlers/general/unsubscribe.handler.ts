import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const unsubscribeHandler: HandlerObject = {
  event: 'unsubscribe',
  handler: async (socket: AuthenticatedSocket, { collections }: { collections: string[] }) => {
    const User = socket.user

    if (!User) {
      return
    }

    App.subManager.unsubscribe(User._id, collections)
  }
}
