import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Polityka kolekcji `games` (4d, kontrakt §1) — trzy role, trzy zakresy:
 *  - user/dev: OR published / własne (devAccountId z tokenu),
 *  - admin (manage-games): cały katalog (widzi cudze `registered` do moderacji),
 *  - gość: WYŁĄCZNIE { status: 'published' } (twarda ścieżka w subscribe.handler).
 * Do tego default-deny gościa dla queue/ratings (gość nie gra ranked).
 */

const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }))

vi.mock('../../app/app', () => ({
  App: { subManager: { subscribe: mockSubscribe } },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { subscribeHandler } from '../../app/socket-handlers/general/subscribe.handler'
import { collectionPolicies } from '../../app/subscriptions/policies'

function subscribedTickets() {
  if (mockSubscribe.mock.calls.length === 0) return []
  return mockSubscribe.mock.calls[0][1] as Array<{ collection: string; filter: any }>
}

describe('polityka games — dev widzi własne, admin wszystko, gość tylko published', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dev: filtr polityki to OR published / własne devAccountId', () => {
    const f = collectionPolicies.games.filter!({ _id: 'dev1', permissions: ['register-games'] })
    expect(f).toEqual({ $or: [{ status: 'published' }, { devAccountId: 'dev1' }] })
  })

  it('admin (manage-games): brak zawężenia — widzi cudze `registered` do moderacji', () => {
    const f = collectionPolicies.games.filter!({ _id: 'adm', permissions: ['manage-games'] })
    expect(f).toEqual({})
  })

  it('admin subskrybujący games dostaje wyłącznie filtr klienta (mergeFilters pomija pusty)', async () => {
    const admin: any = { id: 's-adm', emit: vi.fn(), user: { _id: 'adm', permissions: ['manage-games'] } }
    await subscribeHandler.handler(admin, {
      tickets: [{ collection: 'games', filter: { status: 'registered' } as any }],
    })
    const tickets = subscribedTickets()
    expect(tickets).toHaveLength(1)
    expect(tickets[0].filter).toEqual({ status: 'registered' })
  })

  it('gość: games z twardym filtrem { status: published } — klient nie poszerzy', async () => {
    const guest: any = { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_1', roomId: 'r1' } }
    await subscribeHandler.handler(guest, {
      tickets: [{ collection: 'games', filter: { status: 'registered' } as any }],
    })
    const tickets = subscribedTickets()
    expect(tickets).toHaveLength(1)
    expect(tickets[0].collection).toBe('games')
    expect(tickets[0].filter).toEqual({
      $and: [{ status: 'published' }, { status: 'registered' }],
    })
  })

  it('gość: bez filtra klienta zostaje samo { status: published }', async () => {
    const guest: any = { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_1', roomId: 'r1' } }
    await subscribeHandler.handler(guest, {
      tickets: [{ collection: 'games', filter: {} as any }],
    })
    expect(subscribedTickets()[0].filter).toEqual({ status: 'published' })
  })

  it('gość: queue/ratings/matches odrzucone (tylko rooms i games)', async () => {
    const guest: any = { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_1', roomId: 'r1' } }
    await subscribeHandler.handler(guest, {
      tickets: [
        { collection: 'queue', filter: {} as any },
        { collection: 'ratings', filter: {} as any },
        { collection: 'matches', filter: {} as any },
      ],
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('gość: rooms nadal działa po staremu (twardy filtr członkostwa)', async () => {
    const guest: any = { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_1', roomId: 'r1' } }
    await subscribeHandler.handler(guest, {
      tickets: [{ collection: 'rooms', filter: {} as any }],
    })
    expect(subscribedTickets()[0].filter).toEqual({ 'members.id': 'g_1' })
  })
})
