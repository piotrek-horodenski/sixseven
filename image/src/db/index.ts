import { connect } from 'mongoose'

import { settings } from '@/settings'
import { logger } from '@/logger'

export async function startConnection() {
  try {
    const db = settings.db
    const dbPort = settings.dbPort
    const dbName = settings.dbName
    const dbParams = settings.dbParams

    const connectionString = 'mongodb://' +
      db + ':' + dbPort + '/' + dbName + dbParams
    const database = await connect(connectionString)
    logger.info('database connected')

    return database
  } catch (error) {
    logger.error({ err: error }, 'database connection failed')
  }
}
