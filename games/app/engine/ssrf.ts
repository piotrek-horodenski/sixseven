import dns from 'dns/promises'
import net from 'net'

/**
 * Ochrona przed SSRF (C1). Deweloper rejestruje dowolny URL serwisu gry, a silnik
 * woła go z wnętrza infrastruktury — bez ochrony można by wskazać `localhost`,
 * adresy prywatne albo metadata-endpoint chmury (169.254.169.254).
 *
 * Ten moduł: (1) czysta klasyfikacja adresu IP jako zablokowanego (loopback,
 * prywatne, link-local, ULA, unspecified), (2) `assertAllowedUrl` — sprawdza
 * protokół i rozwiązuje DNS, odrzucając hosty wskazujące na zakresy prywatne.
 *
 * `allowPrivate` (dev/test) wyłącza blokadę — 2a używa fake-serwisu na 127.0.0.1.
 *
 * ZAKRES 2b: resolve + odrzucenie prywatnych + (w resolve-client) zakaz
 * redirectów i limit rozmiaru. PRZYPIĘCIE IP na czas żądania (anty DNS-rebinding)
 * i osobny egress to hardening 2e — udokumentowane, nie zaimplementowane tu.
 */

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split('.').map((x) => Number(x))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true // niepoprawny → traktuj jako zablokowany (bezpieczny default)
  }
  const [a, b] = parts
  if (a === 0) return true                         // 0.0.0.0/8
  if (a === 127) return true                       // loopback 127.0.0.0/8
  if (a === 10) return true                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true          // 192.168.0.0/16
  if (a === 169 && b === 254) return true          // link-local 169.254.0.0/16 (metadata!)
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a >= 224) return true                        // multicast/reserved 224.0.0.0/4+
  return false
}

function ipv6Blocked(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '')
  // IPv4-mapped (::ffff:a.b.c.d) — sprawdź osadzony adres v4.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Blocked(mapped[1])
  if (ip === '::1') return true      // loopback
  if (ip === '::') return true       // unspecified
  if (ip.startsWith('fe80')) return true // link-local fe80::/10
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // ULA fc00::/7
  return false
}

/** Czy adres IP należy do zakresu, którego NIE wolno wołać. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return ipv4Blocked(ip)
  if (kind === 6) return ipv6Blocked(ip)
  return true // nie-IP → zablokuj
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

/**
 * Sprawdza, czy URL wolno wołać: protokół http(s), a host nie rozwiązuje się na
 * zakres prywatny. Rzuca `SsrfBlockedError`, gdy cel jest zablokowany.
 */
export async function assertAllowedUrl(
  url: string,
  options: { allowPrivate?: boolean; lookup?: typeof dns.lookup } = {},
): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SsrfBlockedError(`niepoprawny URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`niedozwolony protokół: ${parsed.protocol}`)
  }
  if (options.allowPrivate) return

  const host = parsed.hostname
  // Literał IP — sprawdź wprost, bez DNS.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfBlockedError(`adres prywatny/zablokowany: ${host}`)
    return
  }

  const lookup = options.lookup ?? dns.lookup
  const addrs = await lookup(host, { all: true })
  if (!addrs.length) throw new SsrfBlockedError(`brak adresów DNS dla ${host}`)
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new SsrfBlockedError(`host ${host} rozwiązuje się na adres prywatny ${a.address}`)
    }
  }
}
