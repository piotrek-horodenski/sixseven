import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './app') } },
  test: {
    globals: true,
    environment: 'node',
    // Wartości-atrapy: settings.service waliduje env przy imporcie i robi
    // process.exit(1) przy braku. Testy jednostkowe nie łączą się z niczym
    // realnym — te wartości tylko przechodzą walidację schematu.
    env: {
      GATE_PORT: '3000',
      WEB_URL: 'https://localhost:5173',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      CERT_KEY_PATH: 'test-key.pem',
      CERT_PATH: 'test-cert.pem',
      JWT_SECRET: 'test-secret-not-used-for-real-signing',
    },
  },
})
