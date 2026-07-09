import { defineConfig } from 'vitest/config'
import path from 'path'

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
  resolve: {
    alias: {
      // Pakiety źródło-only (bez zbudowanego dist/) — w dev/test rozwiązujemy
      // import wprost do źródła TS; esbuild je transpiluje. sixseven-game-rps
      // używa tylko test e2e (silnik ↔ prawdziwy RPS przez serve).
      'sixseven-hmac': path.resolve(__dirname, '../packages/hmac/src/index.ts'),
      'sixseven-sdk': path.resolve(__dirname, '../packages/sdk/src/index.ts'),
      'sixseven-game-rps': path.resolve(__dirname, '../catalog/rps/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    env: {
      GAMES_PORT: '4120',
      // Jednowęzłowy replica set rozgłaszający się pod localhost (transakcje A2
      // działają też na 1-węzłowym RS). 3-węzłowy h2dbs z compose NIE nadaje się
      // do testów z hosta (primary bywa nieosiągalny pod wewnętrzną nazwą docker).
      MONGODB_URI: 'mongodb://localhost:27140/games_test?replicaSet=rs0',
      JWT_SECRET: 'test-secret-not-used-for-real-signing',
      // Krótkie backoffy — testy sterują zegarem, ale trzymajmy wartości sensowne.
      RESOLVE_BACKOFF_MS: '10,10,10',
      // Fake-serwis gry biega na 127.0.0.1 — pozwól na adresy prywatne w testach.
      RESOLVE_ALLOW_PRIVATE: 'true',
      TEST_DB_URI: 'mongodb://localhost:27140/games_test?replicaSet=rs0',
    },
    // Wspólna baza + globalny afterEach: brak równoległości plików (jak w image).
    // (W Vitest 4 wystarcza fileParallelism:false — poolOptions zostały usunięte.)
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
