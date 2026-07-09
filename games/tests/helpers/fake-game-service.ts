import http from 'http'
import { AddressInfo } from 'net'
import { verify, SignedRequest } from 'sixseven-hmac'

/**
 * Fake serwis gry po HTTP (fixture testowy). Weryfikuje podpis HMAC każdego
 * żądania (dowód, że engine podpisuje poprawnie — „głuchy dev" S2 rejestruje
 * wszystkie wywołania) i odpowiada wg wstrzykniętego handlera, co pozwala
 * symulować sukces, błąd, śmieciową odpowiedź i timeout (retry/pause).
 */

export type FakeDirective =
  | { kind: 'ok'; response: unknown }
  | { kind: 'error'; status: number }
  | { kind: 'garbage' }          // niepoprawny JSON → outcome 'schema'
  | { kind: 'hang'; ms: number } // odpowiedź po czasie → klient dostaje timeout

export interface FakeCall {
  body: any
  signatureValid: boolean
  timestamp: string
}

export interface FakeService {
  url: string
  secret: string
  calls: FakeCall[]
  stop: () => Promise<void>
}

export async function startFakeService(opts: {
  secret: string
  handler: (req: any, callIndex: number) => FakeDirective
}): Promise<FakeService> {
  const calls: FakeCall[] = []

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      const provided: SignedRequest = {
        timestamp: String(req.headers['x-sixseven-timestamp'] ?? ''),
        signature: String(req.headers['x-sixseven-signature'] ?? ''),
      }
      const signatureValid = verify(opts.secret, raw, provided)
      let body: any = null
      try { body = JSON.parse(raw) } catch { /* zostaw null */ }

      const idx = calls.length
      calls.push({ body, signatureValid, timestamp: provided.timestamp })

      const directive = opts.handler(body, idx)
      if (directive.kind === 'hang') {
        setTimeout(() => { try { res.end() } catch { /* noop */ } }, directive.ms)
        return
      }
      if (directive.kind === 'error') {
        res.statusCode = directive.status
        res.end('error')
        return
      }
      if (directive.kind === 'garbage') {
        res.setHeader('content-type', 'application/json')
        res.end('{ not valid json')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(directive.response))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${addr.port}/resolve`,
    secret: opts.secret,
    calls,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
