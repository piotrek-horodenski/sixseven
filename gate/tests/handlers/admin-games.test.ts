import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createAdminGamesHandlers } from '../../app/socket-handlers/admin/games.handler'
import type { GamesClient } from '../../app/services/games-client'

function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    approveGame: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    unpublishGame: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ...overrides,
  } as unknown as GamesClient
}

function handlerFor(event: string, client: GamesClient) {
  const h = createAdminGamesHandlers(client).find(x => x.event === event)
  if (!h) throw new Error(`brak handlera ${event}`)
  return h
}

function adminSocket() {
  return {
    id: 's-adm',
    emit: vi.fn(),
    user: { _id: 'adm', username: 'admin', permissions: ['manage-games', 'view-admin'] },
  } as any
}

function playerSocket() {
  return {
    id: 's-p',
    emit: vi.fn(),
    user: { _id: 'u1', username: 'gracz', permissions: ['play-games'] },
  } as any
}

describe('admin:games-approve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('wymaga uprawnienia manage-games', async () => {
    const client = fakeClient()
    const socket = playerSocket()
    await handlerFor('admin:games-approve', client).handler(socket, { gameId: 'moja-gra' })
    expect(client.approveGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('admin:games-approve-error', { message: 'insufficient permissions' })
  })

  it('z uprawnieniem woła games i emituje complete', async () => {
    const client = fakeClient()
    const socket = adminSocket()
    await handlerFor('admin:games-approve', client).handler(socket, { gameId: 'moja-gra' })
    expect(client.approveGame).toHaveBeenCalledWith('moja-gra')
    expect(socket.emit).toHaveBeenCalledWith('admin:games-approve-complete', { gameId: 'moja-gra' })
  })

  it('wymaga gameId', async () => {
    const client = fakeClient()
    const socket = adminSocket()
    await handlerFor('admin:games-approve', client).handler(socket, {})
    expect(client.approveGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('admin:games-approve-error', { message: 'gameId required' })
  })

  it('propaguje błąd z games', async () => {
    const client = fakeClient({
      approveGame: vi.fn().mockResolvedValue({ ok: false, status: 404, error: 'game not found' }),
    })
    const socket = adminSocket()
    await handlerFor('admin:games-approve', client).handler(socket, { gameId: 'nie-ma' })
    expect(socket.emit).toHaveBeenCalledWith('admin:games-approve-error', { message: 'game not found' })
  })
})

describe('admin:games-unpublish', () => {
  beforeEach(() => vi.clearAllMocks())

  it('wymaga uprawnienia manage-games', async () => {
    const client = fakeClient()
    const socket = playerSocket()
    await handlerFor('admin:games-unpublish', client).handler(socket, { gameId: 'moja-gra' })
    expect(client.unpublishGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('admin:games-unpublish-error', { message: 'insufficient permissions' })
  })

  it('z uprawnieniem woła games i emituje complete', async () => {
    const client = fakeClient()
    const socket = adminSocket()
    await handlerFor('admin:games-unpublish', client).handler(socket, { gameId: 'moja-gra' })
    expect(client.unpublishGame).toHaveBeenCalledWith('moja-gra')
    expect(socket.emit).toHaveBeenCalledWith('admin:games-unpublish-complete', { gameId: 'moja-gra' })
  })
})
