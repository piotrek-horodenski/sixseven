import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { SubscriptionTicket } from '../../subscriptions/subscriptions'
import { hasPermission } from '../check-permission'
import logger from '../../logger'

// Collections that require specific permissions to subscribe
const collectionPermissions: Record<string, string> = {
  users: 'manage-users',
  roles: 'manage-roles',
  permissions: 'manage-roles',
  settings: 'manage-settings',
  engines: 'manage-engines',
  clusters: 'manage-engines',
}

export const subscribeHandler: HandlerObject = {
  event: 'subscribe',
  handler: async (socket: AuthenticatedSocket, { tickets }: { tickets: SubscriptionTicket[] }) => {
    const User = socket.user

    if (!User) {
      return
    }

    // Filter out tickets for collections the user lacks permission to access
    const authorizedTickets = tickets.filter(ticket => {
      const requiredPermission = collectionPermissions[ticket.collection]
      if (requiredPermission && !hasPermission(socket, requiredPermission)) {
        logger.warn(
          { socketId: socket.id, userId: User._id, collection: ticket.collection },
          'subscription denied: insufficient permissions',
        )
        return false
      }
      return true
    })

    if (authorizedTickets.length === 0) return

    App.subManager.subscribe(User._id, authorizedTickets.map(ticket => ({
      ...ticket,
      socket,
    })))
  }
}
