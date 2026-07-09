import http from 'http'
import { AddressInfo } from 'net'

/**
 * Proxy z przełącznikiem dostępności (fixture hartowania 2e). Stoi PRZED
 * prawdziwym serwisem gry (RPS na SDK `serve`) i przekazuje żądania bajt-w-bajt
 * (podpis HMAC zostaje nienaruszony), dopóki jest „up". Przełączenie w stan
 * „down" symuluje awarię serwisu gry W TRAKCIE rundy bez zabijania samego RPS —
 * dzięki temu port jest stabilny (brak wyścigu re-listen), a logika gry pozostaje
 * PRAWDZIWA. Silnik widzi to jak realną awarię:
 *
 *  - `down503`  → HTTP 503 → resolve-client: non-2xx → outcome `error` (retry/pause),
 *  - `refuse`   → zerwane połączenie → outcome `error`,
 *  - `hang`     → brak odpowiedzi → resolve-client: timeout budżetu → outcome `timeout`.
 *
 * Powrót do `up` = health-check OK: kolejny /resolve dociera do RPS i runda się
 * dograją.
 */

export type ProxyMode = 'up' | 'down503' | 'refuse' | 'hang'

export interface ToggleProxy {
  /** Bazowy URL proxy (klient dokleja `/resolve`, `/init`). Wskazuje na niego rejestracja. */
  url: string
  /** Przełącz dostępność „serwisu gry". */
  setMode(mode: ProxyMode): void
  /** Ile żądań proxy odebrał (diagnostyka). */
  readonly calls: number
  stop(): Promise<void>
}

export async function startToggleProxy(target: string): Promise<ToggleProxy> {
  const targetUrl = new URL(target)
  let mode: ProxyMode = 'up'
  let calls = 0
  const pending = new Set<http.IncomingMessage>()

  const server = http.createServer((req, res) => {
    calls += 1

    if (mode === 'refuse') {
      // Zerwij połączenie — dla klienta jak padnięty serwis.
      req.socket.destroy()
      return
    }
    if (mode === 'hang') {
      // Nie odpowiadaj — klient trafi w timeout budżetu /resolve.
      pending.add(req)
      req.on('close', () => pending.delete(req))
      return
    }
    if (mode === 'down503') {
      res.statusCode = 503
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'game service unavailable' }))
      return
    }

    // up → przekaż bajt-w-bajt do prawdziwego serwisu gry (HMAC nienaruszony).
    const proxied = http.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (pres) => {
        res.statusCode = pres.statusCode ?? 502
        for (const [k, v] of Object.entries(pres.headers)) {
          if (v !== undefined) res.setHeader(k, v as string | string[])
        }
        pres.pipe(res)
      },
    )
    proxied.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.end('proxy upstream error')
      }
    })
    req.pipe(proxied)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${addr.port}`,
    setMode: (m: ProxyMode) => { mode = m },
    get calls() { return calls },
    stop: () =>
      new Promise<void>((resolve) => {
        for (const req of pending) req.socket.destroy()
        pending.clear()
        server.close(() => resolve())
      }),
  }
}
