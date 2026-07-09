import pino from 'pino'

const logger = pino({
  name: 'games',
  level: process.env.LOG_LEVEL ?? 'info',
})

export default logger
