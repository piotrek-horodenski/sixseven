import { createI18n } from 'vue-i18n'
import { DEFAULT_LANGUAGE } from '@/stores/prefs/prefs.model'
import pl from './locales/pl'
import en from './locales/en'

/**
 * i18n aplikacji (Etap 3, fala 3). Kontrakt: `docs/ETAP3_I18N_CONTRACT.md`.
 *
 * - `legacy: false` (Composition API), `globalInjection: true` — w template'ach
 *   `$t('ns.key')` bez importów.
 * - Locale steruje `usePrefsStore().language` — synchronizacja (watch) jest w
 *   `config/i18n.config.ts`, tu tylko wartość startowa.
 * - Parytet kluczy pl/en wymusza TYP: `en/<ns>.ts` deklaruje `typeof pl-ns`.
 * - W plikach .ts poza komponentami używaj eksportowanego `t` (nie
 *   `useI18n()`, które działa tylko w setup()).
 */

/**
 * Reguła liczby mnogiej dla polskiego — 4 formy w słowniku:
 * `zero | pojedyncza (1) | 2–4 (bez 12–14) | reszta`,
 * np. `'brak graczy | {n} gracz | {n} gracze | {n} graczy'`.
 * Przy 2/3 formach w danym kluczu degraduje jak standard vue-i18n.
 */
function plPluralRule(choice: number, choicesLength: number): number {
  if (choice === 0) {
    return 0
  }

  const teen = choice > 10 && choice < 20
  const endsWithOne = choice % 10 === 1
  const endsWithFew = choice % 10 >= 2 && choice % 10 <= 4

  if (choicesLength < 4) {
    return !teen && endsWithOne ? 1 : 2
  }
  if (!teen && endsWithOne) {
    return 1
  }
  if (!teen && endsWithFew) {
    return 2
  }
  return 3
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LANGUAGE,
  fallbackLocale: 'en',
  pluralRules: {
    pl: plPluralRule,
  },
  messages: { pl, en },
})

/** Tłumaczenie poza komponentami (stores, composables, routes). */
export const t = i18n.global.t.bind(i18n.global) as typeof i18n.global.t
