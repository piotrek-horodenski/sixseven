import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUpdateOne } = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'users', model: { updateOne: mockUpdateOne } },
    ],
  },
}))

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: vi.fn().mockResolvedValue('new-hashed-pw'),
}))

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { profileUpdateHandler, changePasswordHandler } from '../../app/socket-handlers/general/profile.handler'
import * as bcrypt from 'bcrypt'

describe('profileUpdateHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'u1',
        profile: { display: 'Old Name', type: 'regular', status: '' },
        password: 'hashed-pw',
        permissions: [],
      },
    }
    vi.clearAllMocks()
    mockUpdateOne.mockResolvedValue({})
  })

  it('emits stopped when not authenticated', async () => {
    socket.user = null
    await profileUpdateHandler.handler(socket, { display: 'New' })
    expect(socket.emit).toHaveBeenCalledWith('profile:update-stopped', { message: 'not authenticated' })
  })

  it('emits stopped when display name is empty', async () => {
    await profileUpdateHandler.handler(socket, { display: '   ' })
    expect(socket.emit).toHaveBeenCalledWith('profile:update-stopped', { message: 'display name is required' })
  })

  it('emits stopped when display is undefined', async () => {
    await profileUpdateHandler.handler(socket, { display: undefined as any })
    expect(socket.emit).toHaveBeenCalledWith('profile:update-stopped', { message: 'display name is required' })
  })

  it('updates display name and emits complete', async () => {
    await profileUpdateHandler.handler(socket, { display: '  New Name  ' })

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      { $set: { 'profile.display': 'New Name' } },
    )
    expect(socket.user.profile.display).toBe('New Name')
    expect(socket.emit).toHaveBeenCalledWith('profile:update-complete', { display: 'New Name' })
  })
})

describe('changePasswordHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = {
      emit: vi.fn(),
      id: 'socket-1',
      user: {
        _id: 'u1',
        password: 'hashed-pw',
        permissions: [],
      },
    }
    vi.clearAllMocks()
    mockUpdateOne.mockResolvedValue({})
  })

  it('emits stopped when not authenticated', async () => {
    socket.user = null
    await changePasswordHandler.handler(socket, { currentPassword: 'old', newPassword: 'newpw1' })
    expect(socket.emit).toHaveBeenCalledWith('profile:change-password-stopped', { message: 'not authenticated' })
  })

  it('emits stopped when fields are missing', async () => {
    await changePasswordHandler.handler(socket, { currentPassword: '', newPassword: 'newpw1' })
    expect(socket.emit).toHaveBeenCalledWith('profile:change-password-stopped', { message: 'both fields are required' })
  })

  it('emits stopped when new password is too short', async () => {
    await changePasswordHandler.handler(socket, { currentPassword: 'old', newPassword: '12345' })
    expect(socket.emit).toHaveBeenCalledWith('profile:change-password-stopped', { message: 'new password must be at least 6 characters' })
  })

  it('emits stopped when current password is incorrect', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    await changePasswordHandler.handler(socket, { currentPassword: 'wrong', newPassword: 'newpw1' })
    expect(socket.emit).toHaveBeenCalledWith('profile:change-password-stopped', { message: 'current password is incorrect' })
  })

  it('hashes new password and updates user', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    await changePasswordHandler.handler(socket, { currentPassword: 'old', newPassword: 'newpw1' })

    expect(bcrypt.hash).toHaveBeenCalledWith('newpw1', 10)
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      { $set: { password: 'new-hashed-pw' } },
    )
    expect(socket.emit).toHaveBeenCalledWith('profile:change-password-complete')
  })
})
