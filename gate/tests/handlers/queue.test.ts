import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createQueueHandlers } from '../../app/socket-handlers/queue/queue.handler'
import type { GamesClient } from '../../app/services/games-client'

function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    queueJoin: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    queueLeave: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    queueAccept: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ...overrides,
  } as unknown as GamesClient
}

function handlerFor(event: string, client: GamesClient) {
  const h = createQueueHandlers(client).find(x => x.event === event)
  if (!h) throw new Error(`brak handlera ${event}`)
  return h
}

function userSocket() {
  return {
    id: 's-u',
    emit: vi.fn(),
    user: { _id: 'u1', username: 'gracz', permissions: ['play-games'] },
  } as any
}

function guestSocket() {
  return { id: 's-g', emit: vi.fn(), guest: { guestId: 'g_abc', roomId: 'r1' } } as any
}

describe('queue:join', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gość jest jawnie odrzucany (kolejka tylko dla pełnych kont)', async () => {
    const client = fakeClient()
    const socket = guestSocket()
    await handlerFor('queue:join', client).handler(socket, { gameId: 'rps' })
    expect(client.queueJoin).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:join-error', { message: 'queue requires a user session' })
  })

  it('socket tokenu meczu też odrzucony', async () => {
    const client = fakeClient()
    const socket: any = { id: 's-m', emit: vi.fn(), match: { matchId: 'm1', playerId: 'u1' } }
    await handlerFor('queue:join', client).handler(socket, { gameId: 'rps' })
    expect(client.queueJoin).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:join-error', { message: 'queue requires a user session' })
  })

  it('anonim — cisza (wzorzec repo)', async () => {
    const client = fakeClient()
    const socket: any = { id: 's-a', emit: vi.fn() }
    await handlerFor('queue:join', client).handler(socket, { gameId: 'rps' })
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('userId ZAWSZE z tokenu — payload z cudzym userId ignorowany', async () => {
    const client = fakeClient()
    const socket = userSocket()
    await handlerFor('queue:join', client).handler(socket, { gameId: 'rps', userId: 'ofiara' })
    expect(client.queueJoin).toHaveBeenCalledWith('rps', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('queue:join-complete', { gameId: 'rps' })
  })

  it('wymaga gameId', async () => {
    const client = fakeClient()
    const socket = userSocket()
    await handlerFor('queue:join', client).handler(socket, {})
    expect(client.queueJoin).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:join-error', { message: 'gameId required' })
  })

  it('propaguje błąd domenowy (np. gra nie jest rankedEligible)', async () => {
    const client = fakeClient({
      queueJoin: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'game is not ranked eligible' }),
    })
    const socket = userSocket()
    await handlerFor('queue:join', client).handler(socket, { gameId: 'zewnetrzna' })
    expect(socket.emit).toHaveBeenCalledWith('queue:join-error', { message: 'game is not ranked eligible' })
  })
})

describe('queue:leave', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gość odrzucony', async () => {
    const client = fakeClient()
    const socket = guestSocket()
    await handlerFor('queue:leave', client).handler(socket, { gameId: 'rps' })
    expect(client.queueLeave).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:leave-error', { message: 'queue requires a user session' })
  })

  it('user opuszcza kolejkę własnym id z tokenu', async () => {
    const client = fakeClient()
    const socket = userSocket()
    await handlerFor('queue:leave', client).handler(socket, { gameId: 'rps' })
    expect(client.queueLeave).toHaveBeenCalledWith('rps', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('queue:leave-complete', { gameId: 'rps' })
  })
})

describe('queue:accept', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gość odrzucony', async () => {
    const client = fakeClient()
    const socket = guestSocket()
    await handlerFor('queue:accept', client).handler(socket, { gameId: 'rps', proposalId: 'p1' })
    expect(client.queueAccept).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:accept-error', { message: 'queue requires a user session' })
  })

  it('wymaga proposalId', async () => {
    const client = fakeClient()
    const socket = userSocket()
    await handlerFor('queue:accept', client).handler(socket, { gameId: 'rps' })
    expect(client.queueAccept).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('queue:accept-error', { message: 'proposalId required' })
  })

  it('akceptuje propozycję tożsamością z tokenu i emituje complete', async () => {
    const client = fakeClient()
    const socket = userSocket()
    await handlerFor('queue:accept', client).handler(socket, { gameId: 'rps', proposalId: 'p1', userId: 'ofiara' })
    expect(client.queueAccept).toHaveBeenCalledWith('rps', 'u1', 'p1')
    expect(socket.emit).toHaveBeenCalledWith('queue:accept-complete', { gameId: 'rps', proposalId: 'p1' })
  })

  it('propaguje błąd (propozycja wygasła)', async () => {
    const client = fakeClient({
      queueAccept: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'proposal expired' }),
    })
    const socket = userSocket()
    await handlerFor('queue:accept', client).handler(socket, { gameId: 'rps', proposalId: 'stara' })
    expect(socket.emit).toHaveBeenCalledWith('queue:accept-error', { message: 'proposal expired' })
  })
})
