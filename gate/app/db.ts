import { connect } from 'mongoose'

import { SettingsService } from './settings.service'
import logger from './logger'

export class Db {
  public client: any

  async connect(): Promise<void> {
    const settings = SettingsService()
    try {
      this.client = await connect(settings.mongodb)
      logger.info('mongodb connected')
    } catch (err) {
      logger.fatal({ err }, 'mongodb connection failed')
      process.exit(1)
    }
  }
}
