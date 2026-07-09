import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerHandler } from '../../app/socket-handlers/general/register.handler'

const { mockFindOne, mockSave, mockCountDocuments, mockSettingFind } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockSave: vi.fn(),
  mockCountDocuments: vi.fn().mockResolvedValue(0),
  mockSettingFind: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'users', model: { findOne: mockFindOne, countDocuments: mockCountDocuments } },
      { name: 'settings', model: { find: mockSettingFind } },
    ],
    subManager: {},
  },
}))

vi.mock('../../app/services/sync-users.service', () => ({
  syncUser: vi.fn(),
}))

vi.mock('bcrypt', () => ({
  genSalt: vi.fn().mockResolvedValue('salt'),
  hash: vi.fn().mockResolvedValue('hashed-password'),
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('registerHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
    mockCountDocuments.mockResolvedValue(0)
    mockSettingFind.mockReturnValue({ lean: () => Promise.resolve([]) })
  })

  it('returns silently when socket already has a user', async () => {
    socket.user = { _id: 'existing' }
    await registerHandler.handler(socket, { email: 'a@b.com', username: 'alice', password: 'pw' })
    expect(socket.emit).not.toHaveBeenCalled()
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('emits register-stopped when email or username already taken', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing' })
    await registerHandler.handler(socket, { email: 'a@b.com', username: 'alice', password: 'pw' })
    expect(socket.emit).toHaveBeenCalledWith('register-stopped', {
      message: 'username or email already in use',
    })
  })

  it('creates user with guest role by default', async () => {
    mockFindOne.mockResolvedValue(null)
    const savedUser = { _id: 'new-id', username: 'alice' }
    const refetchedUser = { ...savedUser, roles: ['guest'], permissions: [] }
    const MockUserModel: any = vi.fn().mockImplementation(function (data: any) {
      Object.assign(this, data)
      this.save = mockSave.mockResolvedValue(savedUser)
    })
    const { App } = await import('../../app/app')
    ;(App.models[0] as any).model = MockUserModel
    MockUserModel.findOne = mockFindOne
    MockUserModel.findById = vi.fn().mockResolvedValue(refetchedUser)
    MockUserModel.countDocuments = mockCountDocuments

    await registerHandler.handler(socket, { email: 'a@b.com', username: 'alice', password: 'pw' })

    expect(MockUserModel).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        email: 'a@b.com',
        roles: ['guest'],
        profile: { display: 'alice', type: 'regular', status: '' },
      })
    )
  })

  it('assigns admin role to first user when admin-first is enabled', async () => {
    mockFindOne.mockResolvedValue(null)
    mockCountDocuments.mockResolvedValue(0)
    mockSettingFind.mockReturnValue({
      lean: () => Promise.resolve([
        { name: 'register', value: true },
        { name: 'admin-first', value: true },
      ]),
    })
    const savedUser = { _id: 'new-id', username: 'alice' }
    const refetchedUser = { ...savedUser, roles: ['admin'], permissions: ['manage-users'] }
    const MockUserModel: any = vi.fn().mockImplementation(function (data: any) {
      Object.assign(this, data)
      this.save = mockSave.mockResolvedValue(savedUser)
    })
    const { App } = await import('../../app/app')
    ;(App.models[0] as any).model = MockUserModel
    MockUserModel.findOne = mockFindOne
    MockUserModel.findById = vi.fn().mockResolvedValue(refetchedUser)
    MockUserModel.countDocuments = mockCountDocuments

    await registerHandler.handler(socket, { email: 'a@b.com', username: 'alice', password: 'pw' })

    expect(MockUserModel).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['admin'] })
    )
    expect(socket.emit).toHaveBeenCalledWith('register-complete', refetchedUser)
  })

  it('emits register-complete with synced user data', async () => {
    mockFindOne.mockResolvedValue(null)
    mockCountDocuments.mockResolvedValue(5) // not first user
    const savedUser = { _id: 'new-id', username: 'alice' }
    const refetchedUser = { ...savedUser, roles: ['guest'], permissions: [] }
    const MockUserModel: any = vi.fn().mockImplementation(function (data: any) {
      Object.assign(this, data)
      this.save = vi.fn().mockResolvedValue(savedUser)
    })
    const { App } = await import('../../app/app')
    ;(App.models[0] as any).model = MockUserModel
    MockUserModel.findOne = mockFindOne
    MockUserModel.findById = vi.fn().mockResolvedValue(refetchedUser)
    MockUserModel.countDocuments = mockCountDocuments

    await registerHandler.handler(socket, { email: 'a@b.com', username: 'alice', password: 'pw' })

    expect(socket.emit).toHaveBeenCalledWith('register-complete', refetchedUser)
  })
})
