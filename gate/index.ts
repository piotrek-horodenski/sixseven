import { appReady } from './app/app'

appReady.catch((err) => {
  console.error('Failed to start gate:', err)
  process.exit(1)
})
