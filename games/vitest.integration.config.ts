import { defineConfig } from 'vitest/config'

/**
 * Testy INTEGRACYJNE games (silnik meczu na prawdziwym Mongo). Uruchamiane przez
 * `npm run test:integration --workspace games`. Wymagają REPLICA SETU (transakcje
 * A2). Domyślny `npm test` uruchamia tylko testy jednostkowe (m.in. maszyna
 * stanów), bez bazy.
 *
 * Env jest atrapą dla walidacji settings.ts przy imporcie; realne połączenie
 * ustanawia setup.ts przez TEST_DB_URI.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    env: {
      GAMES_PORT: '4120',
      MONGODB_URI: 'mongodb://localhost:27117/games_test?directConnection=true',
      JWT_SECRET: 'test-secret-not-used-for-real-signing',
      // Krótkie backoffy — testy sterują zegarem, ale trzymajmy wartości sensowne.
      RESOLVE_BACKOFF_MS: '10,10,10',
      TEST_DB_URI: 'mongodb://localhost:27117/games_test?directConnection=true',
    },
    // Wspólna baza + globalny afterEach: brak równoległości plików (jak w image).
    fileParallelism: false,
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
