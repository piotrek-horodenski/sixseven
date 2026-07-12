import { HandlerObject, AuthenticatedSocket } from '..'
import { CommandResult } from '../../services/games-client'
import { CreateAccountInput, CreateAccountResult, AccountUserData } from '../../services/account.service'
import logger from '../../logger'

/**
 * Socket-handler konwersji gościa na konto (Etap 4c). Gość (`socket.guest`, token
 * 24h) zakłada pełne konto i zachowuje swoje mecze z okna 7 dni.
 *
 * ANTY-HIJACK: `guestId` bierzemy WYŁĄCZNIE z `socket.guest.guestId` (token) —
 * NIGDY z payloadu. Payloadowy `guestId` jest ignorowany, więc nie da się przejąć
 * cudzych meczów.
 *
 * Zwraca `userData` w kształcie `login-complete` (user + token nowej sesji), żeby
 * web mógł od razu przelogować gościa na konto.
 *
 * Zależności WSTRZYKIWANE (rejestracja, attachGuest, limit) → testy bez sieci/bazy.
 */

export interface GuestConvertHandlerDeps {
  /** Zakłada konto (walidacja unikatu, hash, seed ról, token sesji). Reużyj `account.service`. */
  registerAccount: (input: CreateAccountInput, opts?: { userAgent?: string }) => Promise<CreateAccountResult>
  /** Podpina mecze gościa (okno 7 dni, zero ELO) do nowego konta. */
  attachGuest: (args: { guestId: string; userId: string }) => Promise<CommandResult<{ attached: number }>>
  /**
   * Sprawdza+konsumuje dzienny limit konwersji per IP. `true` = w limicie.
   * Domyślnie licznik dzienny per IP z configu.
   */
  allowConversion?: (ip: string) => boolean
  /** Limit konwersji / dzień / IP (gdy `allowConversion` nie podano). */
  dailyLimit?: number
}

interface ConvertPayload {
  username?: unknown
  email?: unknown
  password?: unknown
  // `guestId` z payloadu jest CELOWO ignorowany (anty-hijack) — nie deklarujemy go.
}

const DEFAULT_DAILY_LIMIT = 5
const DAY_MS = 24 * 60 * 60 * 1000

/** Dzienny licznik per IP. Reset po upływie doby od pierwszej konwersji w oknie. */
function makeDailyLimiter(limit: number): (ip: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return (ip: string): boolean => {
    const now = Date.now()
    const b = buckets.get(ip)
    if (!b || now > b.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + DAY_MS })
      return true
    }
    b.count++
    return b.count <= limit
  }
}

function reasonToMessage(reason: 'taken' | 'disabled' | 'invalid'): string {
  switch (reason) {
    case 'taken': return 'username or email already in use'
    case 'disabled': return 'registration is disabled'
    default: return 'invalid registration data'
  }
}

export function createGuestConvertHandlers(deps: GuestConvertHandlerDeps): HandlerObject[] {
  let limiter: ((ip: string) => boolean) | null = null
  function getAllow(): (ip: string) => boolean {
    if (deps.allowConversion) return deps.allowConversion
    if (!limiter) limiter = makeDailyLimiter(deps.dailyLimit ?? DEFAULT_DAILY_LIMIT)
    return limiter
  }

  const convertHandler: HandlerObject = {
    event: 'guest:convert',
    handler: async (socket: AuthenticatedSocket, payload: ConvertPayload = {}) => {
      const guest = socket.guest
      // Konwersja WYMAGA sesji gościa. Zalogowany user/token meczu nie konwertuje.
      if (!guest || socket.user) {
        socket.emit('guest:convert-error', { message: 'guest session required' })
        return
      }

      const { username, email, password } = payload
      if (typeof username !== 'string' || !username.trim()
        || typeof email !== 'string' || !email.trim()
        || typeof password !== 'string' || password.length < 6) {
        socket.emit('guest:convert-error', { message: 'username, email and password (min 6) required' })
        return
      }

      // Dzienny limit per IP (z handshake) — konsumowany przy każdej próbie.
      const ip = socket.handshake?.address ?? 'unknown'
      if (!getAllow()(ip)) {
        socket.emit('guest:convert-error', { message: 'daily conversion limit reached' })
        return
      }

      const userAgent = (socket.handshake?.headers?.['user-agent'] as string | undefined) ?? ''
      const result = await deps.registerAccount({ username, email, password }, { userAgent })
      if (!result.ok) {
        socket.emit('guest:convert-error', { message: reasonToMessage(result.reason) })
        return
      }

      // guestId ZAWSZE z tokenu — nigdy z payloadu (anty-hijack).
      const guestId = guest.guestId
      const attach = await deps.attachGuest({ guestId, userId: result.userId })
      if (!attach.ok) {
        // Awaria attach NIE kasuje konta — logujemy i zwracamy complete (mecze można
        // dołączyć później; priorytet: konto istnieje i user jest zalogowany).
        logger.warn({ userId: result.userId, guestId, status: attach.status }, 'guest:convert attachGuest failed')
      } else {
        logger.info({ userId: result.userId, guestId, attached: attach.data.attached }, 'guest converted')
      }

      const userData: AccountUserData = result.userData
      socket.emit('guest:convert-complete', {
        userData,
        attached: attach.ok ? attach.data.attached : 0,
      })
    },
  }

  return [convertHandler]
}
