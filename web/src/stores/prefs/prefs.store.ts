import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from './prefs.model'

const LANGUAGE_KEY = 'hydra-language'

/**
 * Store „ustawień aplikacji" (Etap 3B, ekran Preferencje). Na razie tylko
 * język — motyw zostaje w `stores/layout/layout.store.ts` (już miał osobny
 * mechanizm trwałości, tu tylko go konsumujemy z UI).
 *
 * Kontrakt dla fali 3 (i18n): `usePrefsStore().language` to `'pl' | 'en'`,
 * `'pl'` domyślnie. `setLanguage(lang)` zmienia wartość i zapisuje do
 * localStorage (`hydra-language`) — fala 3 może się na to podłączyć (np.
 * `watch(() => prefsStore.language, ...)` przy wpinaniu vue-i18n) bez zmian
 * w tym store.
 */
export const usePrefsStore = defineStore('prefs', () => {
  const language = ref<Language>(readLanguage())

  function readLanguage(): Language {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY)
      if (stored && LANGUAGES.includes(stored as Language)) {
        return stored as Language
      }
    } catch {
      // localStorage może być niedostępny (private mode) — nie krytyczne.
    }
    return DEFAULT_LANGUAGE
  }

  function setLanguage(value: Language) {
    language.value = value
    try {
      localStorage.setItem(LANGUAGE_KEY, value)
    } catch {
      // jw.
    }
  }

  return {
    language,
    setLanguage,
  }
})
