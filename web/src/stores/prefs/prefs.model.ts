// ===========================================================================
// Modele ekranu Preferencje (Etap 3B, fala 2B).
// ===========================================================================

/** Język aplikacji. Pełne i18n (vue-i18n + tłumaczenia) to osobna fala 3 —
 *  tu tylko wybór + trwałość. Fala 3 czyta `usePrefsStore().language`. */
export type Language = 'pl' | 'en'

export const LANGUAGES: Language[] = ['pl', 'en']
export const DEFAULT_LANGUAGE: Language = 'pl'

/**
 * Kształt pola preferencji gry — 1:1 z `manifest.playerPrefs` ustalonym w
 * kontrakcie fali 1B (`docs/ETAP3B_GAMES_CONTRACT.md`). Manifest gry nie jest
 * jeszcze wystawiony do weba, więc na razie zaszywamy opis RPS lokalnie
 * (`game-prefs.catalog.ts`) w DOKŁADNIE tym kształcie — żeby UI dało się
 * przełączyć na dane z backendu bez zmiany renderera (patrz PreferencesView).
 */
export interface IGamePrefField {
  key: string
  type: 'enum'
  values: string[]
  default: string
  /** Klucz i18n etykiety pola — tłumaczy PreferencesView (por. game-prefs.catalog.ts). */
  label: string
}

export interface IGamePrefsSchema {
  gameId: string
  /** Klucz i18n etykiety gry w sekcji „Gry" ekranu preferencji. */
  label: string
  fields: IGamePrefField[]
}
