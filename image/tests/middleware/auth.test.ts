import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('@/settings', () => ({
  settings: { jwtSecret: 'test-secret' },
}))

import { requireAuth } from '../../src/middleware/auth'

function res() {
  const r: any = { json: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

describe('requireAuth middleware', () => {
  const next = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls next and attaches user when valid JWT provided', () => {
    const token = jwt.sign({ _id: 'uid1', username: 'alice', email: 'a@b.com' }, 'test-secret')
    const req: any = { headers: { authorization: `Bearer ${token}` } }
    const r = res()

    requireAuth(req, r, next)

    expect(next).toHaveBeenCalled()
    expect(req.user).toBeDefined()
    expect(req.user._id).toBe('uid1')
    expect(req.user.username).toBe('alice')
    expect(r.status).not.toHaveBeenCalled()
  })

  it('returns 401 when no Authorization header', () => {
    const req: any = { headers: {} }
    const r = res()

    requireAuth(req, r, next)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(r.json).toHaveBeenCalledWith({ message: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is not Bearer', () => {
    const req: any = { headers: { authorization: 'Basic abc123' } }
    const r = res()

    requireAuth(req, r, next)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when JWT is invalid', () => {
    const req: any = { headers: { authorization: 'Bearer invalid.token.here' } }
    const r = res()

    requireAuth(req, r, next)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when JWT is expired', () => {
    const token = jwt.sign({ _id: 'uid1' }, 'test-secret', { expiresIn: '-1s' })
    const req: any = { headers: { authorization: `Bearer ${token}` } }
    const r = res()

    requireAuth(req, r, next)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when JWT signed with wrong secret', () => {
    const token = jwt.sign({ _id: 'uid1' }, 'wrong-secret')
    const req: any = { headers: { authorization: `Bearer ${token}` } }
    const r = res()

    requireAuth(req, r, next)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
