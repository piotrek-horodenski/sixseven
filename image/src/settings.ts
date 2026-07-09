import { config } from 'dotenv'
import { FormatEnum } from 'sharp'
import { z } from 'zod'

config()

const envSchema = z.object({
  IMAGE_ADDRESS:            z.string().default('localhost'),
  IMAGE_PORT:               z.string().default('5179'),
  IMAGE_WEB_PROTOCOL:       z.string().default('http'),
  IMAGE_DB_HOST:            z.string().min(1, 'IMAGE_DB_HOST is required'),
  IMAGE_DB_PORT:            z.string().default('27017'),
  IMAGE_DB_NAME:            z.string().min(1, 'IMAGE_DB_NAME is required'),
  IMAGE_DB_PARAMS:          z.string().default('?directConnection=true'),
  IMAGE_DB_PREFIX:          z.string().default('PG'),
  IMAGE_THUMB_EXTENSION:    z.string().default('png'),
  IMAGE_THUMB_WIDTH:        z.string().default('200'),
  IMAGE_THUMB_HEIGHT:       z.string().default('200'),
  IMAGE_PREVIEW_EXTENSION:  z.string().default('png'),
  IMAGE_PREVIEW_WIDTH:      z.string().default('300'),
  IMAGE_PREVIEW_HEIGHT:     z.string().default('300'),
  IMAGE_DEFAULT_PAGE_SIZE:  z.string().default('100'),
  IMAGE_UPLOADS_PATH:       z.string().default('./uploads'),
  RATE_LIMIT_WINDOW_MS:     z.string().default('60000'),
  RATE_LIMIT_API_MAX:       z.string().default('600'),
  RATE_LIMIT_UPLOAD_MAX:    z.string().default('120'),
  IMAGE_UPLOAD_MAX_SIZE:    z.string().default('52428800'),
  JWT_SECRET:               z.string().min(1, 'JWT_SECRET is required'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

const env = parsed.data

export const settings = {
  adress:           env.IMAGE_ADDRESS,
  port:             env.IMAGE_PORT,
  webProtocol:      env.IMAGE_WEB_PROTOCOL,
  db:               env.IMAGE_DB_HOST,
  dbPort:           env.IMAGE_DB_PORT,
  dbName:           env.IMAGE_DB_NAME,
  dbParams:         env.IMAGE_DB_PARAMS,
  dbPrefix:         env.IMAGE_DB_PREFIX,
  thumbExtension:   env.IMAGE_THUMB_EXTENSION as keyof FormatEnum,
  thumbWidth:       Number(env.IMAGE_THUMB_WIDTH),
  thumbHeight:      Number(env.IMAGE_THUMB_HEIGHT),
  previewExtension: env.IMAGE_PREVIEW_EXTENSION as keyof FormatEnum,
  previewWidth:     Number(env.IMAGE_PREVIEW_WIDTH),
  previewHeight:    Number(env.IMAGE_PREVIEW_HEIGHT),
  defaultPageSize:  Number(env.IMAGE_DEFAULT_PAGE_SIZE),
  uploads:          env.IMAGE_UPLOADS_PATH,
  rateLimitWindowMs:  Number(env.RATE_LIMIT_WINDOW_MS),
  rateLimitApiMax:    Number(env.RATE_LIMIT_API_MAX),
  rateLimitUploadMax: Number(env.RATE_LIMIT_UPLOAD_MAX),
  uploadMaxSize:      Number(env.IMAGE_UPLOAD_MAX_SIZE),
  jwtSecret:          env.JWT_SECRET,
}
