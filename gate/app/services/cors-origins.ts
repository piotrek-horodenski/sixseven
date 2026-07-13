import logger from '../logger'

/**
 * CORS dla `/auth/match-token` (4d — handoff cross-origin do gier zewnętrznych).
 *
 * Origin jest DOZWOLONY, gdy:
 *  - jest originem WEB_URL albo jego wariantem localhost/127.0.0.1 na tym samym
 *    porcie (własne UI platformy — patrz `platformOrigins`), LUB
 *  - należy do zbioru originów `uiUrl` gier `{ status:'published', uiUrl != null }`
 *    (odczyt kolekcji `games` — pisze ją games, gate tylko czyta).
 *
 * Porównanie po PEŁNYM originie (scheme+host+port) wyliczonym przez
 * `new URL(uiUrl).origin`. Zbiór cache'owany in-memory przez `ttlMs` (60 s) —
 * po publish/unpublish nowy origin działa najpóźniej po minucie.
 *
 * Niedozwolony origin => wywołujący NIE ustawia nagłówka ACAO (przeglądarka
 * utnie odpowiedź). Loader WSTRZYKIWANY → testy bez mongo.
 */

export interface MatchTokenOriginCheckerDeps {
  /** WEB_URL z konfiguracji (pełny URL; porównujemy jego origin). */
  webUrl: string
  /** Zwraca `uiUrl` wszystkich gier published z niepustym uiUrl. */
  loadPublishedUiUrls: () => Promise<string[]>
  /** Czas życia cache (ms). Domyślnie 60 000 (kontrakt §3). */
  ttlMs?: number
  /** Wstrzykiwalny zegar (testy TTL). */
  now?: () => number
}

export interface MatchTokenOriginChecker {
  isAllowed(origin: string | undefined): Promise<boolean>
}

const DEFAULT_TTL_MS = 60_000

/** Origin z dowolnego URL-a; `null` gdy niepoprawny (nie wysypuje middleware'u). */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Originy WŁASNEGO webu platformy: origin z WEB_URL + warianty `localhost` /
 * `127.0.0.1` na tym samym schemacie i porcie. Dev-rzeczywistość (Etap 2/3):
 * z HOST_IP ustawionym pod telefon WEB_URL = `http://<LAN-IP>:5273`, ale
 * przeglądarka na desktopie chodzi po `http://localhost:5273` — OBA originy są
 * naszym webem. Stary CORS odbijał każdy origin; checker 4d zawęża do tej listy
 * + originów gier published. (Prod za domeną: warianty localhost są martwe —
 * ewentualne ich wycięcie = świadome doszczelnienie, follow-up.)
 */
function platformOrigins(webUrl: string): Set<string> {
  const set = new Set<string>()
  const origin = originOf(webUrl)
  if (!origin) {
    // WEB_URL nie parsuje się jako URL — porównujemy dosłownie (stary fallback).
    set.add(webUrl)
    return set
  }
  set.add(origin)
  try {
    for (const host of ['localhost', '127.0.0.1']) {
      const variant = new URL(origin)
      variant.hostname = host
      set.add(variant.origin)
    }
  } catch {
    /* warianty localhost są udogodnieniem — ich brak nie psuje głównej ścieżki */
  }
  return set
}

export function createMatchTokenOriginChecker(deps: MatchTokenOriginCheckerDeps): MatchTokenOriginChecker {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS
  const now = deps.now ?? Date.now
  const webOrigins = platformOrigins(deps.webUrl)

  let cached: Set<string> | null = null
  let expiresAt = 0

  async function gameOrigins(): Promise<Set<string>> {
    if (cached && now() < expiresAt) return cached
    try {
      const uiUrls = await deps.loadPublishedUiUrls()
      const origins = new Set<string>()
      for (const uiUrl of uiUrls) {
        const origin = originOf(uiUrl)
        if (origin) origins.add(origin)
      }
      cached = origins
      expiresAt = now() + ttlMs
      return origins
    } catch (err) {
      // Awaria odczytu NIE otwiera CORS-u: wracamy do stanu „tylko WEB_URL"
      // (stale cache, jeśli był — lepszy niż nic; inaczej pusty zbiór).
      logger.error({ err }, 'match-token CORS: failed to load published game origins')
      return cached ?? new Set<string>()
    }
  }

  return {
    async isAllowed(origin: string | undefined): Promise<boolean> {
      if (!origin) return false
      if (webOrigins.has(origin)) return true
      const origins = await gameOrigins()
      return origins.has(origin)
    },
  }
}
