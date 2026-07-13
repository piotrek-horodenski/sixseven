import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createDevHandlers } from '../../app/socket-handlers/dev/dev.handler'
import type { GamesClient } from '../../app/services/games-client'

/** Fake klienta games — tylko metody 4d używane przez handlery dev. */
function fakeClient(overrides: Partial<GamesClient> = {}): GamesClient {
  return {
    registerGame: vi.fn().mockResolvedValue({ ok: true, data: { gameId: 'moja-gra', hmacSecret: 'sekret-raz' } }),
    updateGame: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    ...overrides,
  } as unknown as GamesClient
}

function makeDeps() {
  return { grantDeveloperRole: vi.fn().mockResolvedValue(undefined) }
}

function handlerFor(event: string, client: GamesClient, deps = makeDeps()) {
  const h = createDevHandlers(client, deps).find(x => x.event === event)
  if (!h) throw new Error(`brak handlera ${event}`)
  return { handler: h, deps }
}

/** Socket zalogowanego usera z rolą developer (permission register-games). */
function devSocket() {
  return {
    id: 's-dev',
    emit: vi.fn(),
    user: {
      _id: 'dev1',
      username: 'dev',
      permissions: ['play-games', 'register-games'],
      roles: ['developer'],
      allRoles: ['developer', 'player', 'guest'],
    },
  } as any
}

/** Socket zwykłego gracza (bez roli developer). */
function playerSocket() {
  return {
    id: 's-p',
    emit: vi.fn(),
    user: { _id: 'u1', username: 'gracz', permissions: ['play-games'], roles: ['player'], allRoles: ['player', 'guest'] },
  } as any
}

describe('dev:enroll', () => {
  beforeEach(() => vi.clearAllMocks())

  it('milczy bez zalogowanego usera', async () => {
    const { handler, deps } = handlerFor('dev:enroll', fakeClient())
    const socket: any = { id: 's', emit: vi.fn(), user: null }
    await handler.handler(socket, {})
    expect(socket.emit).not.toHaveBeenCalled()
    expect(deps.grantDeveloperRole).not.toHaveBeenCalled()
  })

  it('nadaje rolę developer userowi z tokenu i emituje complete', async () => {
    const { handler, deps } = handlerFor('dev:enroll', fakeClient())
    const socket = playerSocket()
    await handler.handler(socket, {})
    expect(deps.grantDeveloperRole).toHaveBeenCalledWith('u1')
    expect(socket.emit).toHaveBeenCalledWith('dev:enroll-complete', {})
  })

  it('idempotentny: rola już jest (także dziedziczona) → complete bez zapisu', async () => {
    const { handler, deps } = handlerFor('dev:enroll', fakeClient())
    const socket = devSocket()
    await handler.handler(socket, {})
    expect(deps.grantDeveloperRole).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('dev:enroll-complete', {})
  })
})

describe('dev:register-game', () => {
  beforeEach(() => vi.clearAllMocks())

  const validPayload = {
    gameId: 'moja-gra',
    name: 'Moja gra',
    manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 2, planningPhaseMs: 5000 },
    serviceUrl: 'https://gra.example.com/api',
    uiUrl: 'https://gra.example.com',
  }

  it('wymaga uprawnienia register-games (rola developer)', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:register-game', client)
    const socket = playerSocket()
    await handler.handler(socket, validPayload)
    expect(client.registerGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('dev:register-game-error', { message: 'insufficient permissions' })
  })

  it('devAccountId ZAWSZE z tokenu — payload z cudzym id jest ignorowany', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:register-game', client)
    const socket = devSocket()
    await handler.handler(socket, { ...validPayload, devAccountId: 'ofiara' })
    expect(client.registerGame).toHaveBeenCalledWith(
      expect.objectContaining({ devAccountId: 'dev1' }),
    )
  })

  it('przekazuje hmacSecret JEDEN raz w evencie complete', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:register-game', client)
    const socket = devSocket()
    await handler.handler(socket, validPayload)
    expect(socket.emit).toHaveBeenCalledWith('dev:register-game-complete', {
      gameId: 'moja-gra',
      hmacSecret: 'sekret-raz',
    })
  })

  it('waliduje kształt payloadu (brak gameId / manifest niebędący obiektem)', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:register-game', client)

    const s1 = devSocket()
    await handler.handler(s1, { ...validPayload, gameId: undefined })
    expect(s1.emit).toHaveBeenCalledWith('dev:register-game-error', { message: 'gameId required' })

    const s2 = devSocket()
    await handler.handler(s2, { ...validPayload, manifest: 'nie-obiekt' })
    expect(s2.emit).toHaveBeenCalledWith('dev:register-game-error', { message: 'manifest must be an object' })

    expect(client.registerGame).not.toHaveBeenCalled()
  })

  it('propaguje błąd domenowy z games (np. limit gier per dev)', async () => {
    const client = fakeClient({
      registerGame: vi.fn().mockResolvedValue({ ok: false, status: 409, error: 'dev game limit reached' }),
    })
    const { handler } = handlerFor('dev:register-game', client)
    const socket = devSocket()
    await handler.handler(socket, validPayload)
    expect(socket.emit).toHaveBeenCalledWith('dev:register-game-error', { message: 'dev game limit reached' })
  })
})

describe('dev:update-game', () => {
  beforeEach(() => vi.clearAllMocks())

  it('wymaga uprawnienia register-games', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:update-game', client)
    const socket = playerSocket()
    await handler.handler(socket, { gameId: 'moja-gra', uiUrl: 'https://nowy.example.com' })
    expect(client.updateGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('dev:update-game-error', { message: 'insufficient permissions' })
  })

  it('przekazuje tylko podane pola, devAccountId z tokenu', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:update-game', client)
    const socket = devSocket()
    await handler.handler(socket, { gameId: 'moja-gra', uiUrl: 'https://nowy.example.com', devAccountId: 'ofiara' })
    expect(client.updateGame).toHaveBeenCalledWith({
      devAccountId: 'dev1',
      gameId: 'moja-gra',
      serviceUrl: undefined,
      uiUrl: 'https://nowy.example.com',
      manifest: undefined,
    })
    expect(socket.emit).toHaveBeenCalledWith('dev:update-game-complete', { gameId: 'moja-gra' })
  })

  it('odrzuca pusty update (nic do zmiany)', async () => {
    const client = fakeClient()
    const { handler } = handlerFor('dev:update-game', client)
    const socket = devSocket()
    await handler.handler(socket, { gameId: 'moja-gra' })
    expect(client.updateGame).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith('dev:update-game-error', { message: 'nothing to update' })
  })

  it('propaguje 403-owy błąd własności z games', async () => {
    const client = fakeClient({
      updateGame: vi.fn().mockResolvedValue({ ok: false, status: 403, error: 'not the owner' }),
    })
    const { handler } = handlerFor('dev:update-game', client)
    const socket = devSocket()
    await handler.handler(socket, { gameId: 'cudza-gra', uiUrl: 'https://x.example.com' })
    expect(socket.emit).toHaveBeenCalledWith('dev:update-game-error', { message: 'not the owner' })
  })
})
