import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createMatchTokenOriginChecker } from '../../app/services/cors-origins'

/**
 * CORS /auth/match-token (4d): origin dozwolony gdy WEB_URL LUB origin uiUrl
 * gry published (cache 60 s). Niedozwolony → wywołujący nie ustawia ACAO.
 */

describe('createMatchTokenOriginChecker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('origin WEB_URL zawsze dozwolony (bez sięgania do katalogu)', async () => {
    const loader = vi.fn().mockResolvedValue([])
    const checker = createMatchTokenOriginChecker({ webUrl: 'https://web.example.com', loadPublishedUiUrls: loader })
    expect(await checker.isAllowed('https://web.example.com')).toBe(true)
    expect(loader).not.toHaveBeenCalled()
  })

  it('warianty localhost/127.0.0.1 originu WEB_URL dozwolone (dev: HOST_IP dla telefonu, localhost na desktopie)', async () => {
    const loader = vi.fn().mockResolvedValue([])
    // Regresja z live-testu 2026-07-12: WEB_URL=http://<LAN-IP>:5273, przeglądarka
    // na http://localhost:5273 → fetch /auth/match-token padał NetworkError (brak ACAO).
    const checker = createMatchTokenOriginChecker({ webUrl: 'http://192.168.1.50:5273', loadPublishedUiUrls: loader })
    expect(await checker.isAllowed('http://localhost:5273')).toBe(true)
    expect(await checker.isAllowed('http://127.0.0.1:5273')).toBe(true)
    expect(await checker.isAllowed('http://192.168.1.50:5273')).toBe(true)
    // Inny port albo inny host w LAN nie przechodzi.
    expect(await checker.isAllowed('http://localhost:9999')).toBe(false)
    expect(await checker.isAllowed('http://192.168.1.51:5273')).toBe(false)
    expect(loader).toHaveBeenCalled() // odrzucone originy sięgają jeszcze do katalogu
  })

  it('origin uiUrl gry published dozwolony — porównanie po PEŁNYM originie', async () => {
    const loader = vi.fn().mockResolvedValue(['https://gra.example.com:8443/app/index.html'])
    const checker = createMatchTokenOriginChecker({ webUrl: 'https://web.example.com', loadPublishedUiUrls: loader })
    // Ścieżka uiUrl nie ma znaczenia — liczy się scheme+host+port.
    expect(await checker.isAllowed('https://gra.example.com:8443')).toBe(true)
    // Inny port = inny origin.
    expect(await checker.isAllowed('https://gra.example.com')).toBe(false)
  })

  it('niezarejestrowany origin NIEDOZWOLONY (brak ACAO po stronie API)', async () => {
    const loader = vi.fn().mockResolvedValue(['https://gra.example.com'])
    const checker = createMatchTokenOriginChecker({ webUrl: 'https://web.example.com', loadPublishedUiUrls: loader })
    expect(await checker.isAllowed('https://zly.example.com')).toBe(false)
  })

  it('brak nagłówka Origin → niedozwolone', async () => {
    const checker = createMatchTokenOriginChecker({
      webUrl: 'https://web.example.com',
      loadPublishedUiUrls: vi.fn().mockResolvedValue([]),
    })
    expect(await checker.isAllowed(undefined)).toBe(false)
  })

  it('cache 60 s: drugi odczyt w oknie nie woła loadera, po TTL — woła ponownie', async () => {
    let t = 1_000_000
    const loader = vi.fn().mockResolvedValue(['https://gra.example.com'])
    const checker = createMatchTokenOriginChecker({
      webUrl: 'https://web.example.com',
      loadPublishedUiUrls: loader,
      ttlMs: 60_000,
      now: () => t,
    })

    expect(await checker.isAllowed('https://gra.example.com')).toBe(true)
    expect(await checker.isAllowed('https://gra.example.com')).toBe(true)
    expect(loader).toHaveBeenCalledTimes(1)

    // Po upływie TTL zbiór jest odświeżany (publish/unpublish łapie się ≤ 60 s).
    t += 60_001
    loader.mockResolvedValue([])
    expect(await checker.isAllowed('https://gra.example.com')).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('awaria loadera NIE otwiera CORS-u: zostaje WEB_URL (i ewentualny stale cache)', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('mongo down'))
    const checker = createMatchTokenOriginChecker({ webUrl: 'https://web.example.com', loadPublishedUiUrls: loader })
    expect(await checker.isAllowed('https://gra.example.com')).toBe(false)
    expect(await checker.isAllowed('https://web.example.com')).toBe(true)
  })

  it('niepoprawne uiUrl w katalogu są pomijane (nie wysypują sprawdzenia)', async () => {
    const loader = vi.fn().mockResolvedValue(['nie-url', 'https://ok.example.com'])
    const checker = createMatchTokenOriginChecker({ webUrl: 'https://web.example.com', loadPublishedUiUrls: loader })
    expect(await checker.isAllowed('https://ok.example.com')).toBe(true)
    expect(await checker.isAllowed('nie-url')).toBe(false)
  })
})
