import { describe, it, expect } from 'vitest'
import { isBlockedIp, assertAllowedUrl, SsrfBlockedError } from '../app/engine/ssrf'

describe('isBlockedIp', () => {
  const blocked = [
    '127.0.0.1', '127.13.37.1',         // loopback
    '10.0.0.5', '10.255.255.255',       // 10/8
    '172.16.0.1', '172.31.255.255',     // 172.16/12
    '192.168.1.1',                       // 192.168/16
    '169.254.169.254',                   // link-local / metadata chmury
    '0.0.0.0',                           // unspecified
    '100.64.0.1',                        // CGNAT
    '224.0.0.1',                         // multicast
    '::1', '::',                         // v6 loopback/unspecified
    'fe80::1',                           // v6 link-local
    'fc00::1', 'fd12:3456::1',           // v6 ULA
    '::ffff:127.0.0.1',                  // IPv4-mapped loopback
    'not-an-ip',                         // nie-IP
  ]
  const allowed = [
    '8.8.8.8', '1.1.1.1',
    '172.15.0.1', '172.32.0.1',          // tuż poza 172.16/12
    '192.167.0.1',                       // tuż poza 192.168/16
    '2606:4700:4700::1111',              // publiczny v6
    '::ffff:8.8.8.8',                    // IPv4-mapped publiczny
  ]

  for (const ip of blocked) {
    it(`blokuje ${ip}`, () => expect(isBlockedIp(ip)).toBe(true))
  }
  for (const ip of allowed) {
    it(`przepuszcza ${ip}`, () => expect(isBlockedIp(ip)).toBe(false))
  }
})

describe('assertAllowedUrl', () => {
  it('odrzuca protokół inny niż http(s)', async () => {
    await expect(assertAllowedUrl('ftp://example.com/x')).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(assertAllowedUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('odrzuca literał IP prywatnego / metadata endpoint', async () => {
    await expect(assertAllowedUrl('http://127.0.0.1/resolve')).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(assertAllowedUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('przepuszcza publiczny literał IP', async () => {
    await expect(assertAllowedUrl('https://8.8.8.8/resolve')).resolves.toBeUndefined()
  })

  it('allowPrivate=true przepuszcza loopback (dev/test)', async () => {
    await expect(assertAllowedUrl('http://127.0.0.1:4310/resolve', { allowPrivate: true })).resolves.toBeUndefined()
  })

  it('odrzuca host, który DNS rozwiązuje na adres prywatny (rebinding-owy cel)', async () => {
    const lookup = (async () => [{ address: '10.0.0.5', family: 4 }]) as any
    await expect(assertAllowedUrl('https://evil.example.com/resolve', { lookup })).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('przepuszcza host, który DNS rozwiązuje na adres publiczny', async () => {
    const lookup = (async () => [{ address: '93.184.216.34', family: 4 }]) as any
    await expect(assertAllowedUrl('https://example.com/resolve', { lookup })).resolves.toBeUndefined()
  })
})
