import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const disconnectHandler: HandlerObject = {
  event: 'disconnect',
  handler: (socket: AuthenticatedSocket) => {
    // Multi-device: only tear down THIS socket's subscriptions, not the same
    // identity's other devices. Subscriptions are keyed by the identity used in
    // subscribe.handler: user._id / match.playerId / guest.guestId.
    const subscriberId = socket.user?._id ?? socket.match?.playerId ?? socket.guest?.guestId
    if (!subscriberId) {
      return
    }
    App.subManager.unsubscribeSocket(subscriberId, socket.id, [])
  }
}
