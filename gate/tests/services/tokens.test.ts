import { describe, it, expect } from 'vitest'
import {
  issueGuestToken,
  issueHandoffCode,
  issueMatchToken,
  verifyScopedToken,
  peekTokenType,
} from '../../app/services/tokens.service'
import jwt from 'jsonwebtoken'

const SECRET = 'test-secret'

describe('tokens.service', () => {
  it('issues and verifies a guest token', () => {
    const token = issueGuestToken(SECRET, { guestId: 'g1', roomId: 'r1' })
    const claims = verifyScopedToken(SECRET, token)
    expect(claims).toMatchObject({ typ: 'guest', guestId: 'g1', roomId: 'r1' })
  })

  it('issues and verifies a match token', () => {
    const token = issueMatchToken(SECRET, { matchId: 'm1', playerId: 'p1' })
    expect(verifyScopedToken(SECRET, token)).toMatchObject({ typ: 'match', matchId: 'm1', playerId: 'p1' })
  })

  it('issues and verifies a handoff code', () => {
    const token = issueHandoffCode(SECRET, { matchId: 'm1', subjectId: 'u1' })
    expect(verifyScopedToken(SECRET, token)).toMatchObject({ typ: 'handoff', matchId: 'm1', subjectId: 'u1' })
  })

  it('rejects a token signed with a different secret', () => {
    const token = issueGuestToken(SECRET, { guestId: 'g1', roomId: 'r1' })
    expect(verifyScopedToken('other', token)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = issueGuestToken(SECRET, { guestId: 'g1', roomId: 'r1' }, '-1s')
    expect(verifyScopedToken(SECRET, token)).toBeNull()
  })

  it('verifyScopedToken returns null for a plain user token (no typ)', () => {
    const userToken = jwt.sign({ _id: 'u1' }, SECRET)
    expect(verifyScopedToken(SECRET, userToken)).toBeNull()
  })

  it('peekTokenType distinguishes scoped tokens from user tokens', () => {
    expect(peekTokenType(issueGuestToken(SECRET, { guestId: 'g', roomId: 'r' }))).toBe('guest')
    expect(peekTokenType(issueMatchToken(SECRET, { matchId: 'm', playerId: 'p' }))).toBe('match')
    expect(peekTokenType(jwt.sign({ _id: 'u1' }, SECRET))).toBe('user')
    expect(peekTokenType('not-a-jwt')).toBeNull()
  })
})
