import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Alias @ → src (odpowiednik "paths" z tsconfig). Bez tego vitest nie
  // rozwiązuje importów typu @/consts/mime.const i @/settings.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'node',
    // Wartości-atrapy: settings.ts waliduje env przy imporcie i robi
    // process.exit(1) przy braku.
    env: {
      IMAGE_DB_HOST: 'localhost',
      IMAGE_DB_NAME: 'test',
      JWT_SECRET: 'test-secret-not-used-for-real-signing',
    },
    // Testy integracyjne wymagają ŻYWEGO MongoDB (tworzą realne dokumenty).
    // Biegną osobno przez `npm run test:integration` (vitest.integration.config.ts).
    // Domyślny `npm test` = tylko unit, bez zależności od infrastruktury.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
})
