import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Pakiety źródło-only (bez dist/) — rozwiązujemy do źródła TS w dev/test.
      'sixseven-sdk': path.resolve(__dirname, '../../packages/sdk/src/index.ts'),
      'sixseven-hmac': path.resolve(__dirname, '../../packages/hmac/src/index.ts'),
    },
  },
  test: { globals: true, environment: 'node' },
})
