import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createProfileHandlers,
  ProfileHandlerDeps,
} from '../../app/socket-handlers/profile-public/profile.handler'

const HISTORY = { games: [{ gameId: 'rps', played: 2, wins: 1, losses: 1, draws: 0 }], recent: [] }

function makeDeps(over: Partial<ProfileHandlerDeps> = {}): ProfileHandlerDeps {
  return {
    findPublicUser: vi.fn().mockResolvedValue({ userId: 'u2', display: 'Bob' }),
    playerHistory: vi.fn().mockResolvedValue({ ok: true, data: HISTORY }),
    ...over,
  }
}

function handler(deps: ProfileHandlerDeps) {
  const h = createProfileHandlers(deps).find(x => x.event === 'profile:get')
  if (!h) throw new Error('no profile:get handler')
  return h
}

function userSocket(id: string) {
  return { emit: vi.fn(), id: 'sock', user: { _id: id, username: 'me' } } as any
}

describe('profile:get', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns silently when not authenticated', async () => {
    const socket = { emit: vi.fn(), user: null } as any
    await handler(makeDeps()).handler(socket, { userId: 'u2' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('errors on missing userId', async () => {
    const socket = userSocket('u1')
    await handler(makeDeps()).handler(socket, {})
    expect(socket.emit).toHaveBeenCalledWith('profile:get-error', { message: 'userId required' })
  })

  it('errors when the user is not found', async () => {
    const deps = makeDeps({ findPublicUser: vi.fn().mockResolvedValue(null) })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { userId: 'gone' })
    expect(socket.emit).toHaveBeenCalledWith('profile:get-error', { message: 'user not found' })
  })

  it('returns only sanitized public fields + history (no email/roles/sessions)', async () => {
    const deps = makeDeps()
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { userId: 'u2' })
    expect(socket.emit).toHaveBeenCalledWith('profile:get-complete', {
      profile: { userId: 'u2', display: 'Bob', history: HISTORY },
    })
    const arg = (socket.emit as any).mock.calls[0][1]
    expect(JSON.stringify(arg)).not.toMatch(/email|password|roles|sessions|permissions/i)
  })

  it('degrades to empty history when games is unreachable (does not fail the profile)', async () => {
    const deps = makeDeps({ playerHistory: vi.fn().mockResolvedValue({ ok: false, status: 0, error: 'games unreachable' }) })
    const socket = userSocket('u1')
    await handler(deps).handler(socket, { userId: 'u2' })
    expect(socket.emit).toHaveBeenCalledWith('profile:get-complete', {
      profile: { userId: 'u2', display: 'Bob', history: { games: [], recent: [] } },
    })
  })
})
