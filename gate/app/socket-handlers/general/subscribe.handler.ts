import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { SubscriptionTicket } from '../../subscriptions/subscriptions'
import { getPolicy, mergeFilters, PolicyUser } from '../../subscriptions/policies'
import { hasPermission } from '../check-permission'
import logger from '../../logger'

export const subscribeHandler: HandlerObject = {
  event: 'subscribe',
  handler: async (socket: AuthenticatedSocket, { tickets }: { tickets: SubscriptionTicket[] }) => {
    const User = socket.user

    if (!User) {
      return
    }

    // Apply declarative policies: default-deny for unregistered collections,
    // permission gating, and server-side row-level filter injection.
    const authorizedTickets = tickets.reduce<SubscriptionTicket[]>((acc, ticket) => {
      const policy = getPolicy(ticket.collection)

      // Secure default: a collection with no policy is not subscribable at all.
      // This is what keeps games-private collections (moves, match_views, ...)
      // invisible to gate subscribers.
      if (!policy) {
        logger.warn(
          { socketId: socket.id, userId: User._id, collection: ticket.collection },
          'subscription denied: no policy for collection (default-deny)',
        )
        return acc
      }

      if (policy.requiredPermission && !hasPermission(socket, policy.requiredPermission)) {
        logger.warn(
          { socketId: socket.id, userId: User._id, collection: ticket.collection },
          'subscription denied: insufficient permissions',
        )
        return acc
      }

      // Inject the server-side filter, AND-ed with whatever the client asked for.
      const policyFilter = policy.filter
        ? policy.filter(User as unknown as PolicyUser)
        : undefined
      const mergedFilter = mergeFilters(policyFilter, ticket.filter)

      acc.push({
        collection: ticket.collection,
        filter: mergedFilter,
        socket,
      })
      return acc
    }, [])

    if (authorizedTickets.length === 0) return

    App.subManager.subscribe(User._id, authorizedTickets)
  }
}
