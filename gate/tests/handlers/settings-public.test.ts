import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindOne } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
}))

vi.mock('../../app/app', () => ({
  App: {
    models: [
      { name: 'settings', model: { findOne: mockFindOne } },
    ],
  },
}))

import { settingsPublicHandler } from '../../app/socket-handlers/general/settings-public.handler'

describe('settingsPublicHandler', () => {
  let socket: any

  beforeEach(() => {
    socket = { emit: vi.fn(), id: 'socket-1', user: null }
    vi.clearAllMocks()
  })

  it('emits register: true when no setting exists (default)', async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) })

    await settingsPublicHandler.handler(socket)

    expect(mockFindOne).toHaveBeenCalledWith({ name: 'register' })
    expect(socket.emit).toHaveBeenCalledWith('settings:public', { register: true })
  })

  it('emits register: true when setting value is true', async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ name: 'register', value: true }) })

    await settingsPublicHandler.handler(socket)

    expect(socket.emit).toHaveBeenCalledWith('settings:public', { register: true })
  })

  it('emits register: false when setting value is false', async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ name: 'register', value: false }) })

    await settingsPublicHandler.handler(socket)

    expect(socket.emit).toHaveBeenCalledWith('settings:public', { register: false })
  })

  it('works for unauthenticated sockets', async () => {
    socket.user = null
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ name: 'register', value: true }) })

    await settingsPublicHandler.handler(socket)

    expect(socket.emit).toHaveBeenCalledWith('settings:public', { register: true })
  })
})
