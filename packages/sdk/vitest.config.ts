import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // sixseven-hmac jest źródło-only (bez dist/). W dev/test rozwiązujemy
      // import wprost do źródła TS — esbuild go transpiluje.
      'sixseven-hmac': path.resolve(__dirname, '../hmac/src/index.ts'),
    },
  },
  test: { globals: true, environment: 'node' },
})
