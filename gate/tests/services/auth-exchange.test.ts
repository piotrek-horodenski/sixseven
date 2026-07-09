import { describe, it, expect, vi } from 'vitest'

import { exchangeHandoffForMatchToken } from '../../app/services/auth-exchange'
import { issueHandoffCode, issueGuestToken, issueMatchToken, verifyScopedToken } from '../../app/services/tokens.service'

const SECRET = 'exchange-test-secret'

function matchOk(over: any = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    data: { matchId: 'm1', gameId: 'rps', players: ['u1'], guestIds: [], phase: 'lobby', ...over },
  })
}

describe('exchangeHandoffForMatchToken', () => {
  it('exchanges a valid handoff code for a match token bound to (matchId, subjectId)', async () => {
    const code = issueHandoffCode(SECRET, { matchId: 'm1', subjectId: 'u1' })
    const getMatch = matchOk()
    const res = await exchangeHandoffForMatchToken({ jwtSecret: SECRET, getMatch, now: () => 1_000 }, code)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.matchId).toBe('m1')
    expect(res.playerId).toBe('u1')
    expect(res.gameId).toBe('rps')
    expect(res.expiresAt).toBe(1_000 + 6 * 60 * 60 * 1000)
    // Token is a real match token scoped to the subject.
    const claims = verifyScopedToken(SECRET, res.token)
    expect(claims).toMatchObject({ typ: 'match', matchId: 'm1', playerId: 'u1' })
  })

  it('rejects a missing/empty code', async () => {
    const res = await exchangeHandoffForMatchToken({ jwtSecret: SECRET, getMatch: matchOk() }, '')
    expect(res).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects a token that is not a handoff (e.g. guest/match token)', async () => {
    const guest = issueGuestToken(SECRET, { guestId: 'g_1', roomId: 'r1' })
    const match = issueMatchToken(SECRET, { matchId: 'm1', playerId: 'u1' })
    for (const bad of [guest, match, 'garbage']) {
      const res = await exchangeHandoffForMatchToken({ jwtSecret: SECRET, getMatch: matchOk() }, bad)
      expect(res).toMatchObject({ ok: false, status: 400, message: 'invalid or expired code' })
    }
  })

  it('maps a 404 from get-match to 404', async () => {
    const code = issueHandoffCode(SECRET, { matchId: 'gone', subjectId: 'u1' })
    const getMatch = vi.fn().mockResolvedValue({ ok: false, status: 404, error: 'match not found' })
    const res = await exchangeHandoffForMatchToken({ jwtSecret: SECRET, getMatch }, code)
    expect(res).toMatchObject({ ok: false, status: 404, message: 'match not found' })
  })

  it('rejects a handoff signed with a different secret', async () => {
    const code = issueHandoffCode('other-secret', { matchId: 'm1', subjectId: 'u1' })
    const res = await exchangeHandoffForMatchToken({ jwtSecret: SECRET, getMatch: matchOk() }, code)
    expect(res).toMatchObject({ ok: false, status: 400 })
  })
})
