import type { Socket } from 'socket.io'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const limits = new Map<string, RateLimitEntry>()

export function checkSocketRateLimit(
  socket: Socket,
  event: string,
  maxPerWindow: number,
  windowMs: number,
): boolean {
  const key = `${socket.id}:${event}`
  const now = Date.now()
  const entry = limits.get(key)

  if (!entry || now > entry.resetAt) {
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  entry.count++
  return entry.count <= maxPerWindow
}

export function clearSocketRateLimits(socket: Socket) {
  const prefix = `${socket.id}:`
  limits.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      limits.delete(key)
    }
  })
}
