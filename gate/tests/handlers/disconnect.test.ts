import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disconnectHandler } from '../../app/socket-handlers/general/disconnect.handler'

const { mockUnsubscribeSocket } = vi.hoisted(() => ({
  mockUnsubscribeSocket: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    subManager: { unsubscribeSocket: mockUnsubscribeSocket },
  },
}))

describe('disconnectHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('tears down only this socket (multi-device) with userId, socketId, empty array', () => {
    socket.user = { _id: 'uid1' }
    disconnectHandler.handler(socket)
    expect(mockUnsubscribeSocket).toHaveBeenCalledWith('uid1', 'socket-1', [])
  })

  it('does nothing when socket has no user', () => {
    socket.user = null
    disconnectHandler.handler(socket)
    expect(mo