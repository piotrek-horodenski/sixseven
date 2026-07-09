import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkSocketRateLimit, clearSocketRateLimits } from '../app/socket-rate-limit'

describe('socket-rate-limit — window expiry', () => {
  let socket: any

  beforeEach(() => {
    socket = { id: 'socket-2' }
    clearSocketRateLimits(socket)
    vi.restoreAllMocks()
  })

  it('resets limit after the time window expires', () => {
    const now = 1000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // Use up the limit
    expect(checkSocketRateLimit(socket, 'action', 2, 5000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'action', 2, 5000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'action', 2, 5000)).toBe(false)

    // Advance time past window
    vi.spyOn(Date, 'now').mockReturnValue(now + 5001)

    // Should be allowed again
    expect(checkSocketRateLimit(socket, 'action', 2, 5000)).toBe(true)
  })

  it('does not reset before the window expires', () => {
    const now = 1000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    expect(checkSocketRateLimit(socket, 'action', 1, 5000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'action', 1, 5000)).toBe(false)

    // Advance time but still within window
    vi.spyOn(Date, 'now').mockReturnValue(now + 4999)
    expect(checkSocketRateLimit(socket, 'action', 1, 5000)).toBe(false)
  })

  it('tracks different sockets independently', () => {
    const socket2 = { id: 'socket-3' }
    clearSocketRateLimits(socket2)

    expect(checkSocketRateLimit(socket, 'msg', 1, 10000)).toBe(true)
    expect(checkSocketRateLimit(socket, 'msg', 1, 10000)).toBe(false)

    // Different socket should still be allowed
    expect(checkSocketRateLimit(socket2, 'msg', 1, 10000)).toBe(true)

    clearSocketRateLimits(socket2)
  })
})
