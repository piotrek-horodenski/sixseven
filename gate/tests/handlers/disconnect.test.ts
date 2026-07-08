import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disconnectHandler } from '../../app/socket-handlers/general/disconnect.handler'

const { mockUnsubscribe } = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    subManager: { unsubscribe: mockUnsubscribe },
  },
}))

describe('disconnectHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('calls subManager.unsubscribe with userId and empty array when user exists', () => {
    socket.user = { _id: 'uid1' }
    disconnectHandler.handler(socket)
    expect(mockUnsubscribe).toHaveBeenCalledWith('uid1', [])
  })

  it('does nothing when socket has no user', () => {
    socket.user = null
    disconnectHandler.handler(socket)
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})
