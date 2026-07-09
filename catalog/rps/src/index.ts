import { serve } from 'sixseven-sdk'
import { rps } from './rps'

export { rps }
export default rps

/**
 * Uruchomienie jako zdalny serwis gry: `SIXSEVEN_GAME_SECRET=... GAME_PORT=4310
 * node dist/index.js` (albo `sixseven-sdk serve` na module). Sekret HMAC musi
 * zgadzać się z tym w rejestracji po stronie platformy.
 */
if (require.main === module) {
  const secret = process.env.SIXSEVEN_GAME_SECRET
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error('ustaw SIXSEVEN_GAME_SECRET (sekret HMAC z rejestracji)')
    process.exit(1)
  }
  const port = Number(process.env.GAME_PORT ?? 4310)
  serve(rps, { secret, port })
  // eslint-disable-next-line no-console
  console.log(`RPS serwis (${rps.manifest.version}) na :${port}`)
}
