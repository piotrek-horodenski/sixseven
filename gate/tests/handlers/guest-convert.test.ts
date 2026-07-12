import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createGuestConvertHandlers,
  GuestConvertHandlerDeps,
} from '../../app/socket-handlers/guest-convert/guest-convert.handler'

const OK_USERDATA = {
  _id: 'newu', username: 'alice', email: 'a@b.c', profile: { display: 'alice' }, permissions: [], token: 'jwt-new',
}

function makeDeps(over: Partial<GuestConvertHandlerDeps> = {}): GuestConvertHandlerDeps {
  return {
    registerAccount: vi.fn().mockResolvedValue({ ok: true, userId: 'newu', userData: OK_USERDATA }),
    attachGuest: vi.fn().mockResolvedValue({ ok: true, data: { attached: 3 } }),
    allowConversion: () => true,
    ...over,
  }
}

function handler(deps: GuestConvertHandlerDeps) {
  const h = createGuestConvertHandlers(deps).find(x => x.event === 'guest:convert')
  if (!h) throw new Error('no guest:convert handler')
  return h
}

function guestSocket(guestId: string, address = '1.2.3.4') {
  return { emit: vi.fn(), id: 'sock', guest: { guestId, roomId: 'r1' }, handshake: { address, headers: {} } } as any
}

const VALID = { username: 'alice', email: 'a@b.c', password: 'secret6' }

describe('guest:convert', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a guest session', async () => {
    const deps = makeDeps()
    const socket = { emit: vi.fn(), guest: null, handshake: { address: 'x', headers: {} } } as any
    await handler(deps).handler(socket, VALID)
    expect(socket.emit).toHaveBeenCalledWith('guest:convert-error', { message: 'guest session required' })
    expect(deps.registerAccount).not.toHaveBeenCalled()
  })

  it('takes guestId from the TOKEN, never from the payload (anti-hijack)', async () => {
    const deps = makeDeps()
    const socket = guestSocket('g_real')
    // Attacker tries to steal another guest's matches by passing a foreign guestId.
    await handler(deps).handler(socket, { ...VALID, guestId: 'g_foreign' } as any)
    expect(deps.attachGuest).toHaveBeenCalledWith({ guestId: 'g_real', userId: 'newu' })
    expect(deps.attachGuest).not.toHaveBeenCalledWith(expect.objectContaining({ guestId: 'g_foreign' }))
  })

  it('creates the account and attaches guest matches, returning login-shaped userData', async () => {
    const deps = makeDeps()
    const socket = guestSocket('g_real')
    await handler(deps).handler(socket, VALID)
    expect(deps.registerAccount).toHaveBeenCalledWith(
      { username: 'alice', email: 'a@b.c', password: 'secret6' },
      { userAgent: '' },
    )
    expect(deps.attachGuest).toHaveBeenCalledWith({ guestId: 'g_real', userId: 'newu' })
    expect(socket.emit).toHaveBeenCalledWith('guest:convert-complete', { userData: OK_USERDATA, attached: 3 })
  })

  it('rejects invalid input (short password) before touching register/attach', async () => {
    const deps = makeDeps()
    const socket = guestSocket('g_real')
    await handler(deps).handler(socket, { ...VALID, password: '123' })
    expect(socket.emit).toHaveBeenCalledWith('guest:convert-error', { message: 'username, email and password (min 6) required' })
    expect(deps.registerAccount).not.toHaveBeenCalled()
  })

  it('maps a taken username/email to an error and does not attach', async () => {
    const deps = makeDeps({ registerAccount: vi.fn().mockResolvedValue({ ok: false, reason: 'taken' }) })
    const socket = guestSocket('g_real')
    await handler(deps).handler(socket, VALID)
    expect(socket.emit).toHaveBeenCalledWith('guest:convert-error', { message: 'username or email already in use' })
    expect(deps.attachGuest).not.toHaveBeenCalled()
  })

  it('does NOT fail the conversion when attachGuest fails (account already created)', async () => {
    const deps = makeDeps({ attachGuest: vi.fn().mockResolvedValue({ ok: false, status: 502, error: 'games unreachable' }) })
    const socket = guestSocket('g_real')
    await handler(deps).handler(socket, VALID)
    expect(socket.emit).toHaveBeenCalledWith('guest:convert-complete', { userData: OK_USERDATA, attached: 0 })
  })

  it('enforces the daily conversion limit per IP', async () => {
    // Real limiter with dailyLimit=1: second attempt from the same IP is blocked.
    const deps = makeDeps({ allowConversion: undefined, dailyLimit: 1 })
    const h = handler(deps)
    const a = guestSocket('g_a', '9.9.9.9')
    const b = guestSocket('g_b', '9.9.9.9')
    await h.handler(a, VALID)
    await h.handler(b, VALID)
    expect(a.emit).toHaveBeenCalledWith('guest:convert-complete', expect.anything())
    expect(b.emit).toHaveBeenCalledWith('guest:convert-error', { message: 'daily conversion limit reached' })
  })
})
