import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSubscribe } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    subManager: { subscribe: mockSubscribe },
  },
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { subscribeHandler } from '../../app/socket-handlers/general/subscribe.handler'

// Gated collections (subscribe.handler.ts collectionPermissions):
//   users -> manage-users, roles/permissions -> manage-roles, settings -> manage-settings
// Everything else (incl. color-presets) has no permission requirement.
describe('subscribeHandler — permission-based filtering', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'u1',
        permissions: [],
      },
    }
    vi.clearAllMocks()
  })

  it('does nothing when socket has no user', async () => {
    socket.user = null
    await subscribeHandler.handler(socket, {
      tickets: [{ collection: 'users', filter: {} }],
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('filters out collections requiring permissions user does not have', async () => {
    socket.user.permissions = ['manage-users']

    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'users', filter: {} },      // needs manage-users (has it)
        { collection: 'roles', filter: {} },      // needs manage-roles (missing)
        { collection: 'settings', filter: {} },   // needs manage-settings (missing)
      ],
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    const subscribedTickets = mockSubscribe.mock.calls[0][1]
    expect(subscribedTickets).toHaveLength(1)
    expect(subscribedTickets[0].collection).toBe('users')
  })

  it('allows all tickets when user has all required permissions', async () => {
    socket.user.permissions = ['manage-users', 'manage-roles', 'manage-settings']

    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'users', filter: {} },
        { collection: 'roles', filter: {} },
        { collection: 'permissions', filter: {} },
        { collection: 'settings', filter: {} },
      ],
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    const subscribedTickets = mockSubscribe.mock.calls[0][1]
    expect(subscribedTickets).toHaveLength(4)
  })

  it('returns without subscribing when all tickets are denied', async () => {
    socket.user.permissions = []

    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'users', filter: {} },
        { collection: 'settings', filter: {} },
      ],
    })

    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('allows collections with no permission requirement', async () => {
    socket.user.permissions = []

    await subscribeHandler.handler(socket, {
      tickets: [
        { collection: 'color-presets', filter: {} },
      ],
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    const subscribedTickets = mockSubscribe.mock.calls[0][1]
    expect(subscribedTickets).toHaveLength(1)
    expect(subscribedTickets[0].collection).toBe('color-presets')
  })

  it('passes socket reference in each authorized ticket', async () => {
    socket.user.permissions = ['manage-users']

    await subscribeHandler.handler(socket, {
      tickets: [{ collection: 'users', filter: { active: true } }],
    })

    const subscribedTickets = mockSubscribe.mock.calls[0][1]
    expect(subscribedTickets[0]).toEqual(
      expect.objectContaining({
        collection: 'users',
        filter: { active: true },
        socket,
      }),
    )
  })
})
