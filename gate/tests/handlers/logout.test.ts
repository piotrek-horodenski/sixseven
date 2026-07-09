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

  it('removes only the current session, leaving other devices logged in', async () => {
    const dbUser = {
      _id: 'uid1',
      token: 'device-2',
      sessions: [
        { token: 'device-1', createdAt: 1, userAgent: 'a' },
        { token: 'device-2', createdAt: 2, userAgent: 'b' },
      ],
      save: mockSave,
    }
    // Socket handshake carries THIS device's token (device-2).
    socket.user = { _id: 'uid1' }
    socket.handshake = { auth: { token: 'device-2' } }
    mockFindOne.mockResolvedValue(dbUser)

    await logoutHandler.handler(socket)

    expect(dbUser.sessions).toEqual([{ token: 'device-1', createdAt: 1, userAgent: 'a' }])
    expect(dbUser.token).toBeNull()
    expect(mockSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('logout-complete', { _id: 'uid1' })
  })

  it('leaves the legacy token field untouched when logging out a different device', async () => {
    const dbUser = {
      _id: 'uid1',
      token: 'device-1',
      sessions: [
        { token: 'device-1', createdAt: 1, userAgent: 'a' },
        { token: 'device-2', createdAt: 2, userAgent: 'b' },
      ],
      save: mockSave,
    }
    socket.user = { _id: 'uid1' }
    socket.handshake = { auth: { token: 'device-2' } }
    mockFindOne.mockResolvedValue(dbUser)

    await logoutHandler.handler(socket)

    expect(dbUser.sessions).toEqual([{ token: 'device-1', createdAt: 1, userAgent: 'a' }])
    // device-1 is still the legacy token (this logout was for device-2).
    expect(dbUser.token).toBe('device-1')
  })

  it('emits logout-complete even when DB user not found', async () => {
    socket.user = { _id: 'uid1' }
    mockFindOne.mockResolvedValue(null)

    await logoutHandler.handler(socket)

    expect(mockSave).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('logout-complete', { _id: 'uid1' })
  })
})
