import { sign } from 'sixseven-hmac'

import { InitRequest, InitResponse } from '../contract/wire'
import { GameServiceEndpoint, gameUrl } from './resolve-client'
import { assertAllowedUrl } from './ssrf'
import { settings } from '../settings'
import logger from '../logger'

/**
 * init-client — wywołanie `/init` serwisu gry (stan początkowy meczu liczy GRA).
 * Ten sam reżim bezpieczeństwa co `/resolve`: SSRF guard, podpis HMAC, budżet
 * czasu, limit rozmiaru, zakaz redirectów.
 */

export interface InitCallResult {
  ok: boolean
  state: unknown | null
  /** Manifest zwrócony przez grę (np. planningPhaseMs). Null gdy brak. */
  manifest?: InitResponse['manifest'] | null
}

export interface InitCallOptions {
  now?: number
  budgetMs?: number
  maxBodyBytes?: number
  fetchImpl?: typeof fetch
  allowPrivate?: boolean
}

function isInitResponse(x: unknown): x is InitResponse {
  return typeof x === 'object' && x !== null && 'state' in (x as Record<string, unknown>)
}

export async function callInit(
  endpoint: GameServiceEndpoint,
  request: InitRequest,
  options: InitCallOptions = {},
): Promise<InitCallResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const budgetMs = options.budgetMs ?? settings.resolveBudgetMs
  const maxBodyBytes = options.maxBodyBytes ?? settings.resolveMaxBodyBytes

  try {
    await assertAllowedUrl(endpoint.url, { allowPrivate: options.allowPrivate ?? settings.resolveAllowPrivate })
  } catch (err) {
    logger.warn({ err, url: endpoint.url, matchId: request.matchId }, 'init target blocked (ssrf)')
    return { ok: false, state: null }
  }

  const body = JSON.stringify(request)
  const { timestamp, signature } = sign(endpoint.secret, body, options.now)

  let res: Response
  try {
    res = await fetchImpl(gameUrl(endpoint.url, '/init'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sixseven-timestamp': timestamp,
        'x-sixseven-signature': signature,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(budgetMs),
    })
  } catch (err) {
    logger.warn({ err, matchId: request.matchId }, 'init call failed')
    return { ok: false, state: null }
  }

  if (!res.ok) {
    logger.warn({ status: res.status, matchId: request.matchId }, 'init non-2xx')
    return { ok: false, state: null }
  }

  let text: string
  try {
    text = await res.text()
  } catch {
    return { ok: false, state: null }
  }
  if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) {
    return { ok: false, state: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, state: null }
  }
  if (!isInitResponse(parsed)) {
    return { ok: false, state: null }
  }
  return { ok: true, state: parsed.state, manifest: parsed.manifest ?? null }
}
