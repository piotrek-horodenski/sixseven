import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loginHandler } from '../../app/socket-handlers/general/login.handler'

const { mockFindOne, mockSave } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockSave: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [{ name: 'users', model: { findOne: mockFindOne } }],
    subManager: {},
  },
}))

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}))

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-jwt-token') },
}))

vi.mock('../../app/settings.service', () => ({
  SettingsService: vi.fn(() => ({ jwtSecret: 'test-secret', jwtExpiresIn: '7d' })),
}))

import * as bcrypt from 'bcrypt'

describe('loginHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('returns silently when socket already has a user', async () => {
    socket.user = { _id: 'existing' }
    await loginHandler.handler(socket, { email: 'a@b.com', password: 'pw' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('emits login-stopped when user not found', async () => {
    mockFindOne.mockResolvedValue(null)
    await loginHandler.handler(socket, { email: 'a@b.com', password: 'pw' })
    expect(socket.emit).toHaveBeenCalledWith('login-stopped', { message: 'incorect credentials' })
  })

  it('emits login-stopped when password does not match', async () => {
    mockFindOne.mockResolvedValue({ _id: '1', password: 'hash', save: mockSave })
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    await loginHandler.handler(socket, { email: 'a@b.com', password: 'wrong' })
    expect(socket.emit).toHaveBeenCalledWith('login-stopped', { message: 'incorect credentials' })
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('saves token and emits login-complete on success', async () => {
    const user = {
      _id: 'uid1',
      username: 'alice',
      email: 'a@b.com',
      password: 'hash',
      profile: { display: 'alice' },
      permissions: [],
      token: null,
      save: mockSave,
    }
    mockFindOne.mockResolvedValue(user)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    await loginHandler.handler(socket, { email: 'a@b.com', password: 'pw' })

    expect(user.token).toBe('mock-jwt-token')
    expect(mockSave).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('login-complete', expect.objectContaining({
      _id: 'uid1',
      username: 'alice',
      email: 'a@b.com',
      profile: { display: 'alice' },
      permissions: [],
      token: 'mock-jwt-token',
    }))
  })
})
