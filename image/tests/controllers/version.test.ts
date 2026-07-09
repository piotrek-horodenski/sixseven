import { describe, it, expect, vi } from 'vitest'
import { getVersion } from '../../src/controllers/version.controller'

function res() {
  const r: any = { json: vi.fn() }
  r.status = vi.fn().mockReturnValue(r)
  return r
}

function req(query: any = {}, body: any = {}, params: any = {}) {
  return { query, body, params } as any
}

describe('getVersion', () => {
  it('returns version info', async () => {
    const r = res()
    await getVersion(req(), r)
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ version: expect.any(String) }),
    )
  })
})
