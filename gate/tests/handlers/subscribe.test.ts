import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subscribeHandler } from '../../app/socket-handlers/general/subscribe.handler'

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

describe('subscribeHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('calls subManager.subscribe with userId and tickets', async () => {
    socket.user = { _id: 'uid1', permissions: ['manage-users'] }
    const tickets = [
      { collection: 'users', filter: { active: true } },
      { collection: 'messages', filter: {} },
    ]

    await subscribeHandler.handler(socket, { tickets })

    expect(mockSubscribe).toHaveBeenCalledWith('uid1', [
      { collection: 'users', filter: { active: true }, socket },
      { collection: 'messages', filter: {}, socket },
    ])
  })

  it('does nothing when socket has no user', async () => {
    socket.user = null
    await subscribeHandler.handler(socket, { tickets: [{ collection: 'users', filter: {} }] })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('filters out collections the user lacks permission for', async () => {
    socket.user = { _id: 'uid1', permissions: ['manage-settings'] }
    const tickets = [
      { collection: 'users', filter: {} },      // needs manage-users — denied
      { collection: 'roles', filter: {} },       // needs manage-roles — denied
      { collection: 'settings', filter: {} },    // needs manage-settings — allowed
      { collection: 'messages', filter: {} },    // no restriction — allowed
    ]

    await subscribeHandler.handler(socket, { tickets })

    expect(mockSubscribe).toHaveBeenCalledWith('uid1', [
      { collection: 'settings', filter: {}, socket },
      { collection: 'messages', filter: {}, socket },
    ])
  })

  it('does not call subscribe when all tickets are denied', async () => {
    socket.user = { _id: 'uid1', permissions: [] }
    const tickets = [
      { collection: 'users', filter: {} },
      { collection: 'roles', filter: {} },
    ]

    await subscribeHandler.handler(socket, { tickets })

    expect(mockSubscribe).not.toHaveBeenCalled()
  })
})
