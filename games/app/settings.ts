import { config } from 'dotenv'
import { z } from 'zod'

config()

/**
 * Konfiguracja serwisu games. Wszystkie liczby (budżety, backoffy, timeouty,
 * retencja) są parametrami od dnia 1 — kalibracja z danych produkcji w Etapie 5+
 * (patrz IMPLEMENTATION_PLAN.md „Pozostałe otwarte pytania" i UNKNOWNS.md).
 *
 * WAŻNE: transakcje multi-dokumentowe (A2 — atomowy zapis wyniku rundy) wymagają
 * MongoDB w trybie replica set. MONGODB_URI musi wskazywać na replica set
 * (docker-compose: h2dbs na hydra-mongo1/2/3), nie na standalone.
 */
const envSchema = z.object({
  GAMES_PORT: z.string().default('4120'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // Sekret do weryfikacji tokenów meczu (realne użycie w 2d) — trzymany od 2a,
  // bo silnik i tak potrzebuje go do podpisów wychodzących w kolejnych podetapach.
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

  // Budżet i retry wywołań /resolve do serwisu gry (C2, A4).
  RESOLVE_BUDGET_MS: z.string().default('2000'),          // całkowity budżet od wysłania do pełnego body
  RESOLVE_CONNECT_TIMEOUT_MS: z.string().default('500'),  // osobny timeout na nawiązanie połączenia
  RESOLVE_MAX_BODY_BYTES: z.string().default('1048576'),  // twardy limit rozmiaru odpowiedzi (1 MiB)
  RESOLVE_RETRY_MAX: z.string().default('3'),             // liczba prób w rundzie zanim Paused
  RESOLVE_BACKOFF_MS: z.string().default('2000,4000,8000'), // backoff kolejnych prób (CSV)

  // Fazy meczu.
  PLANNING_MIN_MS: z.string().default('2000'),   // dolny limit fazy planowania (walidacja manifestu)
  REVEAL_MARGIN_MS: z.string().default('2000'),  // margines ponad revealDurationMs
  PAUSED_TIMEOUT_MS: z.string().default('600000'),   // 10 min: Paused → Cancelled
  LOBBY_TIMEOUT_MS: z.string().default('900000'),    // 15 min bez kompletu → Cancelled

  // Harmonogram deadline'ów (A5 — deadline'y w dokumentach, jedna pętla skanująca).
  SCHEDULER_INTERVAL_MS: z.string().default('500'),

  // Retencja resolve_log (E2).
  RESOLVE_LOG_RETENTION_DAYS: z.string().default('30'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:')
  // eslint-disable-next-line no-console
  console.error(parsed.error.format())
  process.exit(1)
}

const env = parsed.data

function csvNumbers(s: string): number[] {
  return s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n))
}

export const settings = {
  port: Number(env.GAMES_PORT),
  mongodb: env.MONGODB_URI,
  jwtSecret: env.JWT_SECRET,

  resolveBudgetMs: Number(env.RESOLVE_BUDGET_MS),
  resolveConnectTimeoutMs: Number(env.RESOLVE_CONNECT_TIMEOUT_MS),
  resolveMaxBodyBytes: Number(env.RESOLVE_MAX_BODY_BYTES),
  resolveRetryMax: Number(env.RESOLVE_RETRY_MAX),
  resolveBackoffMs: csvNumbers(env.RESOLVE_BACKOFF_MS),

  planningMinMs: Number(env.PLANNING_MIN_MS),
  revealMarginMs: Number(env.REVEAL_MARGIN_MS),
  pausedTimeoutMs: Number(env.PAUSED_TIMEOUT_MS),
  lobbyTimeoutMs: Number(env.LOBBY_TIMEOUT_MS),

  schedulerIntervalMs: Number(env.SCHEDULER_INTERVAL_MS),

  resolveLogRetentionDays: Number(env.RESOLVE_LOG_RETENTION_DAYS),
}

export type Settings = typeof settings
