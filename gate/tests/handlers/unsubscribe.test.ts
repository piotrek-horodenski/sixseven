import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unsubscribeHandler } from '../../app/socket-handlers/general/unsubscribe.handler'

const { mockUnsubscribeSocket } = vi.hoisted(() => ({
  mockUnsubscribeSocket: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    subManager: { unsubscribeSocket: mockUnsubscribeSocket },
  },
}))

describe('unsubscribeHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('calls subManager.unsubscribeSocket with userId, socketId and collections', async () => {
    socket.user = { _id: 'uid1' }
    const collections = ['users', 'messages']

    await unsubscribeHandler.handler(socket, { collections })

    expect(mockUnsubscribeSocket).toHaveBeenCalledWith('uid1', 'socket-1', ['users', 'messages'])
  })

  it('does nothing when socket has no user', async () => {
    socket.user = null
    await unsubscribeHandler.handler(socket, { collections: ['users'] })
    expect(mockUnsubscribeSocket).not.toHaveBeenCalled()
  })
})
