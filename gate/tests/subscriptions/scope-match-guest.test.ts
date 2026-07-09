import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S1 (2d) — scope subskrypcji dla socketów meczu / gościa.
 *
 * „Szpieg" z tokenem meczu (jako gracz A) próbuje podejrzeć cudzy match_view
 * (playerId z payloadu). Serwer MUSI scope'ować match_views do playerId z TOKENU
 * (nie z payloadu) i matches do {_id: matchId} — filtr klienta nigdy nie poszerza
 * zakresu. Gość widzi wyłącznie pokoje, których jest członkiem.
 */

const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }))

vi.mock('../../app/app', () => ({
  App: { subManager: { subscribe: mockSubscribe } },
}))
vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { subscribeHandler } from '../../app/socket-handlers/general/subscribe.handler'

function subscribed() {
  if (mockSubscribe.mock.calls.length === 0) return { key: undefined, tickets: [] as any[] }
  return { key: mockSubscribe.mock.calls[0][0], tickets: mockSubscribe.mock.calls[0][1] as any[] }
}

describe('subscribe — match token scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes match_views to the token playerId, never the payload playerId', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null, match: { matchId: 'm1', playerId: 'player-A' } } as any
    await subscribeHandler.handler(socket, {
      tickets: [{ collection: 'match_views', filter: { playerId: 'victim' } as any }],
    })
    const { key, tickets } = subscribed()
    // Klucz subskrypcji = playerId z tokenu.
    expect(key).toBe('player-A')
    expect(tickets).toHaveLength(1)
    // Twardy filtr serwera {playerId, matchId} AND filtr klienta {playerId: victim}.
    expect(tickets[0].collection).toBe('match_views')
    expect(tickets[0].filter).toEqual({
      $and: [{ playerId: 'player-A', matchId: 'm1' }, { playerId: 'victim' }],
    })
  })

  it('scopes matches to {_id: matchId}', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null, match: { matchId: 'm1', playerId: 'player-A' } } as any
    await subscribeHandler.handler(socket, { tickets: [{ collection: 'matches', filter: {} as any }] })
    const { tickets } = subscribed()
    expect(tickets[0].filter).toEqual({ _id: 'm1' })
  })

  it('denies every collection other than matches/match_views', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null, match: { matchId: 'm1', playerId: 'player-A' } } as any
    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'moves', filter: {} as any },
        { collection: 'users', filter: {} as any },
        { collection: 'rooms', filter: {} as any },
      ],
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})

describe('subscribe — guest scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes rooms to {members.id: guestId}, keyed by guestId', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null, guest: { guestId: 'g_1', roomId: 'r1' } } as any
    await subscribeHandler.handler(socket, { tickets: [{ collection: 'rooms', filter: {} as any }] })
    const { key, tickets } = subscribed()
    expect(key).toBe('g_1')
    expect(tickets[0].filter).toEqual({ 'members.id': 'g_1' })
  })

  it('a guest cannot subscribe to matches/match_views', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null, guest: { guestId: 'g_1', roomId: 'r1' } } as any
    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'matches', filter: {} as any },
        { collection: 'match_views', filter: {} as any },
      ],
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})

describe('subscribe — no identity', () => {
  it('does nothing when the socket has no user/match/guest', async () => {
    const socket = { id: 's', emit: vi.fn(), user: null } as any
    await subscribeHandler.handler(socket, { tickets: [{ collection: 'rooms', filter: {} as any }] })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})
