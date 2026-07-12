import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { getPresenceService } from '../../services/presence.service'
import logger from '../../logger'

export const disconnectHandler: HandlerObject = {
  event: 'disconnect',
  handler: (socket: AuthenticatedSocket) => {
    // Multi-device: only tear down THIS socket's subscriptions, not the same
    // identity's other devices. Subscriptions are keyed by the identity used in
    // subscribe.handler: user._id / match.playerId / guest.guestId.
    const subscriberId = socket.user
      ? String(socket.user._id)
      : (socket.match?.playerId ?? socket.guest?.guestId)
    if (!subscriberId) {
      return
    }
    App.subManager.unsubscribeSocket(subscriberId, socket.id, [])

    // Presence (4a): decrement the shared live-session counter for this user.
    // Only the LAST socket closing flips the user offline (goOffline). Guests /
    // match tokens have no presence.
    if (socket.user) {
      const uid = String(socket.user._id)
      void getPresenceService().onDisconnect(uid).catch(err => logger.error({ err, uid }, 'presence onDisconnect failed'))
    }
  }
}
