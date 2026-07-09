import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Szkielet etapu 0 — brak testów jeszcze nie jest błędem. Pełne serve/test
  // (i ich testy) powstają w etapie 2.
  test: { passWithNoTests: true },
})
