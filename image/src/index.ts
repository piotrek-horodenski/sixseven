require('module-alias/register')

import { app } from '@/app'
import { startConnection } from '@/db'
import { logger } from '@/logger'



async function startApp() {
  const db = await startConnection()

  if (!db) {
    logger.fatal('cannot connect to database, exiting')
    return
  }
  await app.listen(app.get('port'))
  logger.info({ port: app.get('port') }, 'server listening')

  process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaught exception'); process.exit(1) })
  process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'unhandled promise rejection'); process.exit(1) })
}

startApp()
