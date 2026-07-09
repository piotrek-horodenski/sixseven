import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config testów INTEGRACYJNYCH serwisu image.
 *
 * Uruchamiany przez `npm run test:integration`. W przeciwieństwie do domyślnego
 * `npm test` (tylko unit), te testy łączą się z prawdziwym MongoDB i tworzą
 * realne dokumenty. Wymagają uruchomionej bazy na localhost:27017
 * (np. `docker compose up -d mongo`).
 *
 * setup.ts (podpięty poniżej) łączy mongoose w beforeAll, czyści kolekcje po
 * każdym teście i usuwa bazę na końcu — dlatego IMAGE_DB_NAME musi być bazą
 * TESTOWĄ, nigdy produkcyjną.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    env: {
      IMAGE_DB_HOST: 'localhost',
      IMAGE_DB_NAME: 'hydra_test',
      JWT_SECRET: 'test-secret-not-used-for-real-signing',
      // Baza image w docker-compose (hydra-image-mongo) jest na hoście pod 27133.
      // setup.ts czyta TEST_DB_URI; nadpisz, jeśli używasz innego Mongo.
      TEST_DB_URI: 'mongodb://localhost:27133/hydra_test?directConnection=true',
    },
    // Operacje na realnej bazie bywają wolniejsze niż domyślne 5 s.
    testTimeout: 15000,
    hookTimeout: 20000,
    // KLUCZOWE: oba pliki integracyjne dzielą JEDNĄ bazę (hydra_test), a setup.ts
    // ma afterEach z deleteMany na wszystkich kolekcjach. Przy równoległości
    // afterEach jednego pliku kasuje dane drugiego w trakcie jego testu →
    // losowe "Photo Not Found" i null-e. Wymuszamy sekwencyjny, jednowątkowy run.
    fileParallelism: false,
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
