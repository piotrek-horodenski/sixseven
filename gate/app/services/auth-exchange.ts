import { verifyScopedToken, issueMatchToken } from './tokens.service'
import { CommandResult, MatchInfo } from './games-client'

/**
 * Wymiana kodu handoff → token meczu (2d, sekcja B). Rdzeń CZYSTY i wstrzykiwalny
 * (sekret, getMatch, zegar) — testuje się bez express/mongo/sieci.
 *
 * Kroki: (1) zweryfikuj handoff (typ `handoff`, podpis, ważność), (2) potwierdź
 * mecz przez games get-match (gameId + istnienie), (3) wystaw token meczu związany
 * z (matchId, playerId=subjectId). `expiresAt = now + ttl` (domyślnie 6h).
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

export interface HandoffExchangeDeps {
  jwtSecret: string
  getMatch: (matchId: string) => Promise<CommandResult<MatchInfo>>
  matchTokenTtlMs?: number
  now?: () => number
}

export type HandoffExchangeResult =
  | { ok: true; token: string; matchId: string; playerId: string; gameId: string; expiresAt: number }
  | { ok: false; status: number; message: string }

export async function exchangeHandoffForMatchToken(
  deps: HandoffExchangeDeps,
  code: unknown,
): Promise<HandoffExchangeResult> {
  if (typeof code !== 'string' || !code) {
    return { ok: false, status: 400, message: 'code required' }
  }

  const claims = verifyScopedToken(deps.jwtSecret, code)
  if (!claims || claims.typ !== 'handoff') {
    return { ok: false, status: 400, message: 'invalid or expired code' }
  }

  const { matchId, subjectId } = claims
  const match = await deps.getMatch(matchId)
  if (!match.ok) {
    return { ok: false, status: match.status === 404 ? 404 : 400, message: match.error }
  }

  const token = issueMatchToken(deps.jwtSecret, { matchId, playerId: subjectId })
  const ttl = deps.matchTokenTtlMs ?? SIX_HOURS_MS
  const expiresAt = (deps.now ? deps.now() : Date.now()) + ttl

  return {
    ok: true,
    token,
    matchId,
    playerId: subjectId,
    gameId: match.data.gameId,
    expiresAt,
  }
}
