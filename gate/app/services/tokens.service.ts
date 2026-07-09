import jwt from 'jsonwebtoken'

/**
 * Typy tokenów sixseven (IMPLEMENTATION_PLAN.md — "Tożsamość i tokeny").
 *
 *  user    — pełne API wg RBAC (7 dni, rewokacja w DB) — wystawiany w login.handler.
 *  guest   — wejście z linku pokoju bez konta (24 h): jeden pokój, casual, czat.
 *  handoff — jednorazowy kod przekierowania do aplikacji gry (60 s) → wymiana na token meczu.
 *  match   — scoped do jednego meczu (do końca meczu): subskrypcja własnego match_views
 *            + matches tego meczu, submit-move, reveal-done, zapis prefs.
 *
 * Funkcje przyjmują `secret` jawnie, więc moduł jest czysty i testowalny bez
 * ładowania settings.service (który waliduje env i robi process.exit przy imporcie).
 *
 * UWAGA (etap 1): handoff/match są zescaffoldowane — jednorazowość handoffu i
 * wiązanie tokenu meczu z konkretnym meczem egzekwuje games w etapie 2 (kolekcje
 * registrations/matches jeszcze nie istnieją).
 */

export type TokenType = 'user' | 'guest' | 'handoff' | 'match'

export interface GuestClaims {
  typ: 'guest'
  guestId: string
  roomId: string
}

export interface HandoffClaims {
  typ: 'handoff'
  matchId: string
  subjectId: string // userId lub guestId
}

export interface MatchClaims {
  typ: 'match'
  matchId: string
  playerId: string
}

export type ScopedClaims = GuestClaims | HandoffClaims | MatchClaims

export function issueGuestToken(secret: string, claims: Omit<GuestClaims, 'typ'>, expiresIn = '24h'): string {
  return jwt.sign({ ...claims, typ: 'guest' } satisfies GuestClaims, secret, { expiresIn } as jwt.SignOptions)
}

export function issueHandoffCode(secret: string, claims: Omit<HandoffClaims, 'typ'>, expiresIn = '60s'): string {
  return jwt.sign({ ...claims, typ: 'handoff' } satisfies HandoffClaims, secret, { expiresIn } as jwt.SignOptions)
}

export function issueMatchToken(secret: string, claims: Omit<MatchClaims, 'typ'>, expiresIn = '6h'): string {
  return jwt.sign({ ...claims, typ: 'match' } satisfies MatchClaims, secret, { expiresIn } as jwt.SignOptions)
}

/** Zwraca zdekodowane claimy lub null gdy podpis/ważność niepoprawne. */
export function verifyScopedToken(secret: string, token: string): ScopedClaims | null {
  try {
    const decoded = jwt.verify(token, secret) as Record<string, unknown>
    const typ = decoded.typ
    if (typ === 'guest' || typ === 'handoff' || typ === 'match') {
      return decoded as unknown as ScopedClaims
    }
    return null
  } catch {
    return null
  }
}

/** Odczytuje samo `typ` bez weryfikacji (do rozgałęzienia w middleware). */
export function peekTokenType(token: string): TokenType | null {
  const decoded = jwt.decode(token) as Record<string, unknown> | null
  const typ = decoded?.typ
  if (typ === 'user' || typ === 'guest' || typ === 'handoff' || typ === 'match') {
    return typ
  }
  // Tokeny użytkownika z login.handler nie mają pola typ — traktujemy brak jako 'user'.
  return decoded ? 'user' : null
}
