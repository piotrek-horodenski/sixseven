import http from 'http'
import { verify, SignedRequest } from 'sixseven-hmac'

import {
  GameDefinition,
  ResolveRequest,
  ResolveResponse,
  ResolvedMove,
} from './contract'

/**
 * `serve` — opakowuje `GameDefinition` twórcy w bezstanowy serwis HTTP zgodny z
 * wire contract. Odpowiada za brzeg bezpieczeństwa, którego gra nie musi pisać:
 *
 *  - weryfikacja podpisu HMAC (odrzuca niepodpisane/spoza okna czasu),
 *  - limit rozmiaru ciała (odrzuca zbyt duże żądania zanim je sparsuje),
 *  - walidacja strukturalna żądania,
 *  - egzekucja `validateMove` w `/resolve`: nielegalny lub brakujący ruch dostaje
 *    `defaultMove` (oznaczony `defaulted`), nigdy nie wywraca rundy,
 *  - mapowanie wyniku gry na `ResolveResponse` z domyślnymi polami.
 *
 * Rdzeń (`handleResolve`) jest CZYSTĄ funkcją (raw body + nagłówki → wynik),
 * więc testuje się bez podnoszenia serwera. `serve()` tylko go opakowuje.
 */

export interface ServeOptions {
  secret: string
  maxBodyBytes?: number
  /** Okno HMAC (ms). Domyślnie 30 s (zgodnie z sixseven-hmac). */
  windowMs?: number
  now?: number
}

export interface HandlerResult {
  status: number
  body: string
}

const DEFAULT_MAX_BODY = 1_048_576 // 1 MiB

function err(status: number, message: string): HandlerResult {
  return { status, body: JSON.stringify({ error: message }) }
}

function isResolveRequest(x: unknown): x is ResolveRequest {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.matchId === 'string' &&
    typeof o.round === 'number' &&
    typeof o.manifestVersion === 'string' &&
    Array.isArray(o.moves) &&
    Array.isArray(o.latePlayers)
  )
}

/**
 * Czysty rdzeń obsługi `/resolve`. Zwraca status + ciało JSON, nie dotyka sieci.
 */
export function handleResolve(
  def: GameDefinition,
  rawBody: string,
  headers: Record<string, string | undefined>,
  options: ServeOptions,
): HandlerResult {
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY

  // 1) Limit rozmiaru — zanim cokolwiek sparsujemy.
  if (Buffer.byteLength(rawBody, 'utf8') > maxBody) {
    return err(413, 'payload too large')
  }

  // 2) Podpis HMAC nad SUROWYM ciałem (bajt w bajt).
  const provided: SignedRequest = {
    timestamp: String(headers['x-sixseven-timestamp'] ?? ''),
    signature: String(headers['x-sixseven-signature'] ?? ''),
  }
  const ok = verify(options.secret, rawBody, provided, {
    windowMs: options.windowMs,
    now: options.now,
  })
  if (!ok) {
    return err(401, 'invalid signature')
  }

  // 3) Parsowanie + walidacja strukturalna.
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return err(400, 'invalid json')
  }
  if (!isResolveRequest(parsed)) {
    return err(400, 'invalid resolve request')
  }
  const request = parsed

  // 4–5) Walidacja ruchów + rozstrzygnięcie (współdzielone z harnessem).
  try {
    const response = resolvePipeline(def, request)
    return { status: 200, body: JSON.stringify(response) }
  } catch {
    return err(500, 'resolve threw')
  }
}

/**
 * Czysta logika rundy bez warstwy sieci/HMAC: walidacja ruchów (nielegalny/
 * brakujący → defaultMove z flagą `defaulted`), wywołanie `resolve` gry i
 * mapowanie na `ResolveResponse` z domyślnymi polami. Współdzielona przez
 * `serve` (produkcja) i `harness` (kontrakt-testy), żeby obie ścieżki liczyły
 * IDENTYCZNIE.
 */
export function resolvePipeline(def: GameDefinition, request: ResolveRequest): ResolveResponse {
  const state = request.state
  const resolved: ResolvedMove[] = []
  for (const pm of request.moves) {
    if (!pm || typeof pm.playerId !== 'string') continue
    if (def.validateMove(pm.move, state, pm.playerId)) {
      resolved.push({ playerId: pm.playerId, move: pm.move, defaulted: false })
    } else {
      resolved.push({ playerId: pm.playerId, move: def.defaultMove(state, pm.playerId), defaulted: true })
    }
  }
  for (const late of request.latePlayers) {
    resolved.push({ playerId: late, move: def.defaultMove(state, late), defaulted: true })
  }

  const result = def.resolve(state, resolved)
  return {
    state: result.state,
    events: result.events ?? [],
    points: result.points ?? {},
    views: result.views ?? [],
    finished: Boolean(result.finished),
    revealDurationMs: Number(result.revealDurationMs) || 0,
  }
}

/** Startuje serwis HTTP obsługujący `POST /resolve` (i `GET /health`). */
export function serve(
  def: GameDefinition,
  options: ServeOptions & { port: number },
): http.Server {
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ service: def.manifest.id, version: def.manifest.version, status: 'ok' }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/resolve') {
      res.statusCode = 404
      res.end()
      return
    }

    let raw = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      raw += chunk
      // Odsiew strumieniowy — nie wczytujemy w nieskończoność.
      if (Buffer.byteLength(raw, 'utf8') > maxBody) {
        tooLarge = true
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooLarge) return
      const headers: Record<string, string | undefined> = {
        'x-sixseven-timestamp': req.headers['x-sixseven-timestamp'] as string | undefined,
        'x-sixseven-signature': req.headers['x-sixseven-signature'] as string | undefined,
      }
      const result = handleResolve(def, raw, headers, options)
      res.statusCode = result.status
      res.setHeader('content-type', 'application/json')
      res.end(result.body)
    })
  })

  server.listen(options.port)
  return server
}
