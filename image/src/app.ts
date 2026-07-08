import express, { Application} from 'express'
import path from 'path'
import cors from 'cors'
import fs from 'fs-extra'
import rateLimit from 'express-rate-limit'

import indexRoutes from '@/routes'
import { settings } from '@/settings'
import { logger } from '@/logger'



(async () => {
  try {
    await fs.ensureDir(path.join(settings.uploads, 'thumbs'))
  } catch (error) {
    logger.error({ err: error }, 'failed to ensure uploads directory')
  }
})()

const apiLimiter = rateLimit({
  windowMs: settings.rateLimitWindowMs,
  limit: settings.rateLimitApiMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const app: Application = express()

app.set('port', settings.port)
app.use(cors())
app.use(express.json())
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.use('/api', apiLimiter)
app.use('/api', indexRoutes)

export { app }
