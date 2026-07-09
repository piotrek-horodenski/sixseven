import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Testy integracyjne (silnik na prawdziwym Mongo/replica set) biegną osobno
    // przez `npm run test:integration` (vitest.integration.config.ts). Domyślny
    // `npm test` = tylko jednostkowe (m.in. czysta maszyna stanów), bez bazy.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
