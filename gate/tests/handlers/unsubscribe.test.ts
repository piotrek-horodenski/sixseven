import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unsubscribeHandler } from '../../app/socket-handlers/general/unsubscribe.handler'

const { mockUnsubscribe } = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    subManager: { unsubscribe: mockUnsubscribe },
  },
}))

describe('unsubscribeHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('calls subManager.unsubscribe with userId and collections', async () => {
    socket.user = { _id: 'uid1' }
    const collections = ['users', 'messages']

    await unsubscribeHandler.handler(socket, { collections })

    expect(mockUnsubscribe).toHaveBeenCalledWith('uid1', ['users', 'messages'])
  })

  it('does nothing when socket has no user', async () => {
    socket.user = null
    await unsubscribeHandler.handler(socket, { collections: ['users'] })
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})
