import mongoose from 'mongoose'

import { settings } from './settings'
import logger from './logger'

/**
 * Połączenie z MongoDB (mongoose). Silnik używa transakcji multi-dokumentowych
 * (A2), więc URI musi wskazywać na replica set — inaczej `session.withTransaction`
 * rzuci przy pierwszym zapisie wyniku rundy.
 */
export async function connectDb(): Promise<typeof mongoose> {
  try {
    await mongoose.connect(settings.mongodb)
    logger.info('mongodb connected')
    return mongoose
  } catch (err) {
    logger.fatal({ err }, 'mongodb connection failed')
    process.exit(1)
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
