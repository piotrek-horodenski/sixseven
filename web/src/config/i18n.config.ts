import { watch, type App } from 'vue'

import { i18n } from '@/i18n'
import { usePrefsStore } from '@/stores/prefs/prefs.store'

/**
 * Wpięcie vue-i18n (fala 3). Pinia jest instalowana w `main.ts` PRZED
 * configami, więc `usePrefsStore()` tu działa. Locale podąża za
 * `prefsStore.language` (ekran Preferencje + localStorage `hydra-language`);
 * `immediate` ustawia właściwy język przed pierwszym renderem.
 */
export default (app: App) => {
  app.use(i18n)

  const prefs = usePrefsStore()
  watch(
    () => prefs.language,
    language => {
      i18n.global.locale.value = language
    },
    { immediate: true },
  )
}
