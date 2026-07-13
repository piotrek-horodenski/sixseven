import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import { SubscriptionTicket, SubscriptionTicketFilter } from '../../subscriptions/subscriptions'
import { getPolicy, mergeFilters, PolicyUser } from '../../subscriptions/policies'
import { hasPermission } from '../check-permission'
import logger from '../../logger'

/**
 * Subskrypcja. Trzy tożsamości socketu — trzy ścieżki autoryzacji, wszystkie z
 * twardym filtrem serwera AND-owanym z filtrem klienta (klient nigdy nie
 * poszerza zakresu) oraz default-deny dla kolekcji spoza dozwolonych:
 *
 *  - `socket.user`  — pełne polityki (permission gating + row-level). Klucz: user._id.
 *  - `socket.match` — WYŁĄCZNIE `matches` {_id: matchId} i `match_views`
 *                     {playerId, matchId}. Klucz: playerId (z tokenu, nie payloadu).
 *  - `socket.guest` — `rooms` {'members.id': guestId} oraz katalog `games`
 *                     wyłącznie {status:'published'} (kontrakt 4d §1). Klucz: guestId.
 */
export const subscribeHandler: HandlerObject = {
  event: 'subscribe',
  handler: async (socket: AuthenticatedSocket, { tickets }: { tickets: SubscriptionTicket[] }) => {
    if (socket.user) {
      handleUser(socket, socket.user, tickets)
      return
    }
    if (socket.match) {
      handleMatch(socket, socket.match, tickets)
      return
    }
    if (socket.guest) {
      handleGuest(socket, socket.guest, tickets)
      return
    }
    // Brak tożsamości — brak subskrypcji.
  },
}

function handleUser(
  socket: AuthenticatedSocket,
  User: NonNullable<AuthenticatedSocket['user']>,
  tickets: SubscriptionTicket[],
) {
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
    // User._id to ObjectId (mongoose); dane row-level (players, playerId,
    // members.id) trzymamy jako stringi, wiec normalizujemy do stringa — inaczej
    // filtr {players: ObjectId} nie trafia w string i subskrypcja zwraca pustke.
    const policyUser: PolicyUser = {
      _id: String((User as unknown as { _id: unknown })._id),
      permissions: (User as unknown as { permissions?: string[] }).permissions,
    }
    const policyFilter = policy.filter ? policy.filter(policyUser) : undefined
    const mergedFilter = mergeFilters(policyFilter, ticket.filter)

    acc.push({
      collection: ticket.collection,
      filter: mergedFilter,
      socket,
    })
    return acc
  }, [])

  if (authorizedTickets.length === 0) return

  App.subManager.subscribe(String(User._id), authorizedTickets)
}

function handleMatch(
  socket: AuthenticatedSocket,
  match: NonNullable<AuthenticatedSocket['match']>,
  tickets: SubscriptionTicket[],
) {
  const { matchId, playerId } = match
  const authorized = tickets.reduce<SubscriptionTicket[]>((acc, ticket) => {
    let serverFilter: SubscriptionTicketFilter | undefined
    if (ticket.collection === 'matches') {
      serverFilter = { _id: matchId } as unknown as SubscriptionTicketFilter
    } else if (ticket.collection === 'match_views') {
      serverFilter = { playerId, matchId } as unknown as SubscriptionTicketFilter
    } else {
      logger.warn(
        { socketId: socket.id, playerId, collection: ticket.collection },
        'subscription denied: match token may only see matches/match_views',
      )
      return acc
    }
    acc.push({ collection: ticket.collection, filter: mergeFilters(serverFilter, ticket.filter), socket })
    return acc
  }, [])

  if (authorized.length === 0) return
  App.subManager.subscribe(playerId, authorized)
}

function handleGuest(
  socket: AuthenticatedSocket,
  guest: NonNullable<AuthenticatedSocket['guest']>,
  tickets: SubscriptionTicket[],
) {
  const { guestId } = guest
  const authorized = tickets.reduce<SubscriptionTicket[]>((acc, ticket) => {
    let serverFilter: SubscriptionTicketFilter
    if (ticket.collection === 'rooms') {
      serverFilter = { 'members.id': guestId } as unknown as SubscriptionTicketFilter
    } else if (ticket.collection === 'games') {
      // Gość widzi WYŁĄCZNIE opublikowany katalog (kontrakt 4d §1) — twardy
      // filtr serwera; klient może tylko zawęzić ($and), nigdy poszerzyć.
      serverFilter = { status: 'published' } as unknown as SubscriptionTicketFilter
    } else {
      logger.warn(
        { socketId: socket.id, guestId, collection: ticket.collection },
        'subscription denied: guest may only see rooms and published games',
      )
      return acc
    }
    acc.push({ collection: ticket.collection, filter: mergeFilters(serverFilter, ticket.filter), socket })
    return acc
  }, [])

  if (authorized.length === 0) return
  App.subManager.subscribe(guestId, authorized)
}
