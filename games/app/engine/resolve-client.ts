import { sign } from 'sixseven-hmac'

import { ResolveRequest, ResolveResponse, ResolveOutcome } from '../contract/wire'
import { assertAllowedUrl } from './ssrf'
import { settings } from '../settings'
import logger from '../logger'

/**
 * resolve-client — POJEDYNCZA próba wywołania `/resolve` serwisu gry.
 *
 * Odpowiada za: kanoniczny JSON body → podpis HMAC (świeży timestamp per próba,
 * A4) → HTTP POST z budżetem czasu (C2) → walidacja strukturalna odpowiedzi z
 * limitem rozmiaru. NIE zajmuje się retry/backoffem ani decyzją o Paused — to
 * robi engine na podstawie maszyny stanów (świeży podpis wymusza właśnie
 * ponowne wywołanie tej funkcji per próba).
 *
 * SSRF (C1) — pełna ochrona (pin IP, odrzucanie zakresów prywatnych, egress) to
 * podetap 2b; tutaj minimalnie zakazujemy podążania za redirectami i twardo
 * limitujemy rozmiar odpowiedzi.
 */

export interface GameServiceEndpoint {
  /** BAZOWY URL serwisu gry (bez ścieżki). Klienci doklejają `/resolve`, `/init`. */
  url: string
  /** Sekret HMAC współdzielony z twórcą gry (z rejestracji). */
  secret: string
}

/** Dokleja ścieżkę do bazowego URL-a serwisu gry (bez podwójnych `/`). */
export function gameUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

export interface ResolveCallResult {
  outcome: ResolveOutcome
  response: ResolveResponse | null
  /** Ciało żądania (kanoniczne) — do zapisania w resolve_log. */
  requestBody: ResolveRequest
}

export interface ResolveCallOptions {
  now?: number
  budgetMs?: number
  maxBodyBytes?: number
  /** Wstrzykiwalny fetch (testy). Domyślnie globalny fetch (Node ≥ 18). */
  fetchImpl?: typeof fetch
  /** Pozwól na adresy prywatne/loopback (dev/test). Domyślnie z settings. */
  allowPrivate?: boolean
}

/** Walidacja strukturalna odpowiedzi (bez znajomości reguł gry). */
export function isValidResolveResponse(x: unknown): x is ResolveResponse {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.events)) return false
  if (!Array.isArray(o.views)) return false
  if (typeof o.finished !== 'boolean') return false
  if (typeof o.revealDurationMs !== 'number' || !Number.isFinite(o.revealDurationMs) || o.revealDurationMs < 0) return false
  if (typeof o.points !== 'object' || o.points === null || Array.isArray(o.points)) return false
  // views: każdy element ma playerId:string
  for (const v of o.views as unknown[]) {
    if (typeof v !== 'object' || v === null) return false
    if (typeof (v as Record<string, unknown>).playerId !== 'string') return false
  }
  return true
}

export async function callResolve(
  endpoint: GameServiceEndpoint,
  request: ResolveRequest,
  options: ResolveCallOptions = {},
): Promise<ResolveCallResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const budgetMs = options.budgetMs ?? settings.resolveBudgetMs
  const maxBodyBytes = options.maxBodyBytes ?? settings.resolveMaxBodyBytes

  const base = { outcome: 'error' as ResolveOutcome, response: null, requestBody: request }

  // SSRF (C1): odrzuć cel wskazujący na zakres prywatny/loopback (chyba że dev/test).
  try {
    await assertAllowedUrl(endpoint.url, { allowPrivate: options.allowPrivate ?? settings.resolveAllowPrivate })
  } catch (err) {
    logger.warn({ err, url: endpoint.url, matchId: request.matchId, round: request.round }, 'resolve target blocked (ssrf)')
    return base
  }

  // Kanoniczne ciało: DOKŁADNIE ten string idzie po drucie i jest podpisywany.
  const body = JSON.stringify(request)
  const { timestamp, signature } = sign(endpoint.secret, body, options.now)

  let res: Response
  try {
    res = await fetchImpl(gameUrl(endpoint.url, '/resolve'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sixseven-timestamp': timestamp,
        'x-sixseven-signature': signature,
      },
      body,
      redirect: 'error', // zakaz podążania za redirectami (zalążek C1)
      signal: AbortSignal.timeout(budgetMs),
    })
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    const outcome: ResolveOutcome = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error'
    logger.warn({ err, matchId: request.matchId, round: request.round }, 'resolve call failed')
    return { ...base, outcome }
  }

  if (!res.ok) {
    logger.warn({ status: res.status, matchId: request.matchId, round: request.round }, 'resolve non-2xx')
    return base
  }

  // Wczesny odsiew po Content-Length (gdy serwis go poda).
  const declared = Number(res.headers.get('content-length') ?? 'NaN')
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    logger.warn({ declared, maxBodyBytes, matchId: request.matchId, round: request.round }, 'resolve body too large (declared)')
    return { ...base, outcome: 'schema' }
  }

  let text: string
  try {
    text = await res.text()
  } catch (err) {
    logger.warn({ err }, 'resolve body read failed')
    return base
  }

  if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) {
    return { ...base, outcome: 'schema' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ...base, outcome: 'schema' }
  }

  if (!isValidResolveResponse(parsed)) {
    return { ...base, outcome: 'schema' }
  }

  return { outcome: 'ok', response: parsed, requestBody: request }
}
