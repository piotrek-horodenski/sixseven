import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * S3 (podstawowy) — audyt kanałów eksfiltracji na powierzchni aplikacji gry.
 *
 * Aplikacja gry z natury widzi ruch gracza w trakcie rysowania (sekret ruchu).
 * PEŁNE egzekwowanie izolacji (CSP `connect-src` tylko API platformy, blokada
 * WebRTC, statyczny bundle) należy do zaufanego hostingu bundli — Etap 4 (D1).
 * Tu, na dev-trasie `/game/rps`, robimy tyle, ile da się bez CSP: statyczny
 * audyt kodu, że aplikacja NIE używa kanałów wyprowadzania danych i rozmawia
 * WYŁĄCZNIE z platformą (env `VITE_GATE_*`), oraz nie utrwala treści ruchów.
 *
 * To jest test-strażnik: jeśli ktoś doda `fetch` na obcy origin, WebRTC,
 * beacon albo zapis do storage — pęknie tutaj.
 */

// Powierzchnia aplikacji gry: widok + klienci tokenu meczu.
const surfaceFiles = [
  '../GameRpsView.vue',
  '../../../composables/useMatchClient.ts',
  '../../../composables/useTokenSocket.ts',
]

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
}

const sources = surfaceFiles.map((f) => ({ file: f, src: read(f) }))

describe('S3 — aplikacja gry nie ma kanałów eksfiltracji', () => {
  // Kanały wyprowadzania danych poza dozwolony socket/REST platformy.
  const forbidden: { name: string; re: RegExp }[] = [
    { name: 'WebRTC (RTCPeerConnection)', re: /RTCPeerConnection/ },
    { name: 'navigator.sendBeacon', re: /sendBeacon/ },
    { name: 'XMLHttpRequest', re: /XMLHttpRequest/ },
    { name: 'importScripts', re: /importScripts/ },
    { name: 'surowy WebSocket (obok io())', re: /new\s+WebSocket\s*\(/ },
    { name: 'EventSource', re: /new\s+EventSource\s*\(/ },
    { name: 'eval', re: /\beval\s*\(/ },
    { name: 'atrybut <a ping>', re: /\sping\s*=/ },
    { name: 'rel prefetch/preconnect', re: /rel=["']?(prefetch|preconnect|dns-prefetch)/ },
  ]

  for (const { file, src } of sources) {
    for (const { name, re } of forbidden) {
      it(`${file} — brak: ${name}`, () => {
        expect(re.test(src)).toBe(false)
      })
    }
  }

  it('nie utrwala treści meczu (brak localStorage/sessionStorage na powierzchni gry)', () => {
    for (const { file, src } of sources) {
      expect(src, `${file} nie powinien dotykać storage`).not.toMatch(/localStorage|sessionStorage/)
    }
  })

  it('każdy adres sieciowy celuje w platformę (localhost/env), zero obcych originów', () => {
    const urlLiteral = /(https?|wss?):\/\/[^\s'"`)]+/g
    for (const { file, src } of sources) {
      const urls = src.match(urlLiteral) ?? []
      for (const url of urls) {
        // Dozwolone: tylko domyślny fallback platformy na localhost. Prawdziwy
        // adres i tak pochodzi z env (VITE_GATE_URL / VITE_GATE_HTTP_URL).
        expect(url, `${file}: obcy origin ${url}`).toMatch(/localhost/)
      }
    }
  })

  it('endpoint sieciowy pochodzi z env platformy (VITE_GATE_*)', () => {
    const matchClient = sources.find((s) => s.file.includes('useMatchClient'))!.src
    const tokenSocket = sources.find((s) => s.file.includes('useTokenSocket'))!.src
    // REST wymiany handoff→token meczu: baza z VITE_GATE_HTTP_URL.
    expect(matchClient).toMatch(/import\.meta\.env\.VITE_GATE_HTTP_URL/)
    expect(matchClient).toMatch(/\/auth\/match-token/)
    // Socket: origin z VITE_GATE_URL, przez io() (nie surowy WebSocket).
    expect(tokenSocket).toMatch(/import\.meta\.env\.VITE_GATE_URL/)
    expect(tokenSocket).toMatch(/\bio\s*\(/)
  })
})

describe('S3 — powrót z gry tylko na ścieżkę lokalną (bez open-redirect)', () => {
  const view = read('../GameRpsView.vue')

  it('returnUrl jest walidowany (marker negatywnego lookaheadu ścieżki lokalnej)', () => {
    // Utwardzenie: /^\/(?![/\\])/ — jeden wiodący slash, bez // i bez schematu.
    // Sprawdzamy obecność markera guardu obok nawigacji przez location.
    expect(view).toContain('window.location.href')
    expect(view).toMatch(/\(\?!\[\/\\\\\]\)/)
  })

  it('regex powrotu odrzuca obce originy i przepuszcza ścieżki lokalne', () => {
    const safe = /^\/(?![/\\])/
    expect(safe.test('/rooms/abc')).toBe(true)
    expect(safe.test('/play')).toBe(true)
    expect(safe.test('//evil.com')).toBe(false)
    expect(safe.test('https://evil.com')).toBe(false)
    expect(safe.test('/\\evil.com')).toBe(false)
    expect(safe.test('javascript:alert(1)')).toBe(false)
  })
})
