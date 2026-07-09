import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S1 — Szpieg API (test sekretu, stały pakiet CI).
 *
 * Konto z ważnym JWT próbuje wszystkich kolekcji i filtrów. Musi być
 * niemożliwe: (a) subskrypcja kolekcji prywatnej games, (b) zobaczenie cudzych
 * wierszy w kolekcji row-level (filtr klienta nie poszerza zakresu polityki).
 *
 * Test operuje na subscribeHandler — punkcie, w którym polityki są egzekwowane.
 */

const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }))

vi.mock('../../app/app', () => ({
  App: { subManager: { subscribe: mockSubscribe } },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { subscribeHandler } from '../../app/socket-handlers/general/subscribe.handler'

function subscribedTickets() {
  if (mockSubscribe.mock.calls.length === 0) return []
  return mockSubscribe.mock.calls[0][1] as Array<{ collection: string; filter: any }>
}

describe('S1 — API spy cannot exfiltrate secrets', () => {
  let spy: any

  beforeEach(() => {
    vi.clearAllMocks()
    // A logged-in player with NO admin permissions.
    spy = { id: 'spy-socket', emit: vi.fn(), user: { _id: 'spy', permissions: ['play-games'] } }
  })

  it('cannot subscribe to private games collections (default-deny)', async () => {
    await subscribeHandler.handler(spy, {
      tickets: [
        { collection: 'moves', filter: {} },
        { collection: 'match_states', filter: {} },
        { collection: 'resolve_log', filter: {} },
        { collection: 'player_memory', filter: {} },
        { collection: 'registrations', filter: {} },
      ],
    })
    // Every private collection denied -> nothing subscribed at all.
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('cannot see another player\'s match_views even with a crafted filter', async () => {
    await subscribeHandler.handler(spy, {
      tickets: [
        { collection: 'match_views', filter: { playerId: 'victim' } as any },
      ],
    })

    const tickets = subscribedTickets()
    expect(tickets).toHaveLength(1)
    // Server ANDs its own playerId==spy, so the crafted victim filter can never
    // widen the scope: the result set is forced empty for anyone but the owner.
    expect(tickets[0].collection).toBe('match_views')
    expect(tickets[0].filter).toEqual({
      $and: [{ playerId: 'spy' }, { playerId: 'victim' }],
    })
  })

  it('match_views without a client filter is still scoped to the owner', async () => {
    await subscribeHandler.handler(spy, {
      tickets: [{ collection: 'match_views', filter: {} as any }],
    })
    const tickets = subscribedTickets()
    expect(tickets[0].filter).toEqual({ playerId: 'spy' })
  })

  it('cannot subscribe to admin collections without permission', async () => {
    await subscribeHandler.handler(spy, {
      tickets: [
        { collection: 'users', filter: {} },
        { collection: 'roles', filter: {} },
        { collection: 'settings', filter: {} },
      ],
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('mixed batch: only the permitted, correctly-scoped tickets survive', async () => {
    await subscribeHandler.handler(spy, {
      tickets: [
        { collection: 'moves', filter: {} },                       // denied (private)
        { collection: 'users', filter: {} },                       // denied (no perm)
        { collection: 'match_views', filter: { playerId: 'x' } as any }, // scoped
        { collection: 'color-presets', filter: {} },               // public, allowed
      ],
    })
    const tickets = subscribedTickets()
    const byCol = Object.fromEntries(tickets.map(t => [t.collection, t.filter]))
    expect(Object.keys(byCol).sort()).toEqual(['color-presets', 'match_views'])
    expect(byCol['match_views']).toEqual({ $and: [{ playerId: 'spy' }, { playerId: 'x' }] })
  })
})
