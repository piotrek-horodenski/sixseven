import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logoutHandler } from '../../app/socket-handlers/general/logout.handler'

const { mockFindOne, mockSave, mockUnsubscribe } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockSave: vi.fn(),
  mockUnsubscribe: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [{ name: 'users', model: { findOne: mockFindOne } }],
    subManager: { unsubscribe: mockUnsubscribe },
  },
}))

describe('logoutHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('sets socket.user to null regardless of auth state', async () => {
    socket.user = { _id: 'uid1' }
    mockFindOne.mockResolvedValue({ _id: 'uid1', token: 'tok', save: mockSave })
    await logoutHandler.handler(socket)
    expect((socket as any).user).toBeNull()
  })

  it('returns without emitting when socket had no user', async () => {
    socket.user = null
    await logoutHandler.handler(socket)
    expect(socket.emit).not.toHaveBeenCalled()
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('calls subManager.unsubscribe with userId and empty array', async () => {
    socket.user = { _id: 'uid1' }
    mockFindOne.mockResolvedValue({ _id: 'uid1', token: 'tok', save: mockSave })
    await logoutHandler.handler(socket)
    expect(mockUnsubscribe).toHaveBeenCalledWith('uid1', [])
  })

  it('clears token, saves, and emits logout-complete', async () => {
    const dbUser = { _id: 'uid1', token: 'old-token', save: mockSave }
    socket.user = { _id: 'uid1' }
    mockFindOne.mockResolvedValue(dbUser)

    await logoutHandler.handler(socket)

    expect(dbUser.token).toBeNull()
    expect(mockSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('logout-complete', { _id: 'uid1' })
  })

  it('emits logout-complete even when DB user not found', async () => {
    socket.user = { _id: 'uid1' }
    mockFindOne.mockResolvedValue(null)

    await logoutHandler.handler(socket)

    expect(mockSave).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('logout-complete', { _id: 'uid1' })
  })
})
