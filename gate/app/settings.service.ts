import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
  GATE_PORT:            z.string().min(1, 'GATE_PORT is required'),
  WEB_URL:              z.string().min(1, 'WEB_URL is required'),
  MONGODB_URI:          z.string().min(1, 'MONGODB_URI is required'),
  CERT_KEY_PATH:        z.string().min(1, 'CERT_KEY_PATH is required'),
  CERT_PATH:            z.string().min(1, 'CERT_PATH is required'),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_API_MAX:   z.string().default('600'),
  RATE_LIMIT_UPLOAD_MAX: z.string().default('30'),
  SUBSCRIPTION_QUERY_LIMIT: z.string().default('1000'),
  JWT_SECRET:             z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN:         z.string().default('7d'),
  // Proxy komend gate→games (2c). GAMES_URL = bazowy URL serwisu games
  // (klient dokleja /command/*). INTERNAL_SECRET MUSI być identyczny jak w
  // games/.env (nagłówek x-sixseven-internal, porównanie w stałym czasie).
  GAMES_URL:              z.string().default('http://localhost:4120'),
  INTERNAL_SECRET:        z.string().default('dev-internal-secret-change-me'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

const env = parsed.data

export const SettingsService = () => ({
  port:     env.GATE_PORT,
  webUrl:   env.WEB_URL,
  mongodb:  env.MONGODB_URI,
  certKey:  env.CERT_KEY_PATH,
  cert:     env.CERT_PATH,
  rateLimitWindowMs:  Number(env.RATE_LIMIT_WINDOW_MS),
  rateLimitApiMax:    Number(env.RATE_LIMIT_API_MAX),
  rateLimitUploadMax: Number(env.RATE_LIMIT_UPLOAD_MAX),
  subscriptionQueryLimit: Number(env.SUBSCRIPTION_QUERY_LIMIT),
  jwtSecret:    env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  gamesUrl:       env.GAMES_URL,
  internalSecret: env.INTERNAL_SECRET,
})