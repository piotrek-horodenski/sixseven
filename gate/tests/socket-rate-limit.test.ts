import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkSocketRateLimit, clearSocketRateLimits } from '../app/socket-rate-limit'

describe('socket-rate-limit', () => {
  let socket: any

  beforeEach(() => {
    socket = { id: 'socket-1' }
    clearSocketRateLimits(socket)
    vi.restoreAllMocks()
  })

  it('allows requests within the limit', () => {
    expect(checkSocketRateLimit(socket, 'message', 3, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'message', 3, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'message', 3, 10000)).toBe(true)
  })

  it('returns false when max requests exceeded within window', () => {
    expect(checkSocketRateLimit(socket, 'message', 2, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'message', 2, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'message', 2, 10000)).toBe(false)
  })

  it('clearSocketRateLimits removes tracking for the socket', () => {
    checkSocketRateLimit(socket, 'message', 2, 10000)
    checkSocketRateLimit(socket, 'message', 2, 10000)
    clearSocketRateLimits(socket)
    // After clearing, the next call should be allowed again
    expect(checkSocketRateLimit(socket, 'message', 2, 10000)).toBe(true)
  })

  it('different events have separate limits', () => {
    expect(checkSocketRateLimit(socket, 'message', 1, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'message', 1, 10000)).toBe(false)
    // Different event should still be allowed
    expect(checkSocketRateLimit(socket, 'typing', 1, 10000)).toBe(true)
  })
})
