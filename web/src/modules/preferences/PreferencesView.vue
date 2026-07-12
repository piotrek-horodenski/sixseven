<script setup lang="ts">

import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ISelectOption } from '@/controls/controls.model'
import { useLayoutStore } from '@/stores/layout/layout.store'
import { ETheme } from '@/stores/layout/layout.model'
import { usePrefsStore } from '@/stores/prefs/prefs.store'
import { useGamePrefsStore } from '@/stores/prefs/game-prefs.store'
import { GAME_PREFS_CATALOG } from '@/stores/prefs/game-prefs.catalog'
import { LANGUAGES, type Language } from '@/stores/prefs/prefs.model'

/**
 * Ekran Preferencje (menu profilu). Etap 3B, fala 2B:
 *  - motyw (light/dark) — `stores/layout/layout.store.ts`, trwały w
 *    localStorage (`hydra-theme`), tu tylko podłączony do przełącznika;
 *  - język (pl/en) — `stores/prefs/prefs.store.ts`, trwały w localStorage
 *    (`hydra-language`); pełne i18n to osobna fala 3, tu tylko wybór;
 *  - ustawienia per gra (RPS: ruch awaryjny) — `stores/prefs/game-prefs.store.ts`
 *    (socket `games:get-prefs`/`games:set-prefs`, poza meczem, playerId z JWT
 *    po stronie gate). Renderowane GENERYCZNIE z `GAME_PREFS_CATALOG` — dodanie
 *    kolejnej gry to tylko nowy wpis w katalogu, bez zmian w tym widoku.
 */

const { t, te } = useI18n()
const layout = useLayoutStore()
const prefs = usePrefsStore()
const gamePrefs = useGamePrefsStore()

const isDark = computed<boolean>({
  get: () => layout.theme === ETheme.dark,
  set: (value) => {
    layout.theme = value ? ETheme.dark : ETheme.light
  },
})

// Endonimy (Polski/English) — te same w obu locale, klucze dla porządku.
const languageOptions = computed<ISelectOption<Language>[]>(() =>
  LANGUAGES.map((lang) => ({
    value: lang,
    label: t(`preferences.languageNames.${lang}`),
  })),
)

const language = computed<Language | null>({
  get: () => prefs.language,
  set: (value) => {
    if (value) prefs.setLanguage(value)
  },
})

/** Etykieta wartości enum z prefs — tłumaczona, gdy mamy klucz; inaczej surowa wartość. */
function fieldOptions(values: string[]): ISelectOption<string>[] {
  return values.map((value) => ({
    value,
    label: te(`preferences.optionValues.${value}`) ? t(`preferences.optionValues.${value}`) : value,
  }))
}

function fieldValue(gameId: string, key: string, fallback: string): string {
  const stored = gamePrefs.prefsFor(gameId)[key]
  return typeof stored === 'string' ? stored : fallback
}

function setFieldValue(gameId: string, key: string, value: string) {
  gamePrefs.savePrefs(gameId, { [key]: value })
}

onMounted(() => {
  gamePrefs.init()
  GAME_PREFS_CATALOG.forEach((schema) => gamePrefs.loadPrefs(schema.gameId))
})

onUnmounted(() => {
  gamePrefs.cleanup()
})

</script>
<template>
<div class="preferences-view">
  <section class="preferences-section">
    <h2 class="preferences-section__title">{{ $t('preferences.app.title') }}</h2>

    <div class="preferences-field preferences-field--inline">
      <span class="preferences-field__label">{{ $t('preferences.app.darkTheme') }}</span>
      <UiSwitch v-model="isDark" />
    </div>

    <div class="preferences-field">
      <span class="preferences-field__label">{{ $t('preferences.app.language') }}</span>
      <UiSelect
        v-model="language"
        :options="languageOptions"
        :placeholder="$t('preferences.app.languagePlaceholder')"
      />
    </div>
  </section>

  <section
    v-for="schema in GAME_PREFS_CATALOG"
    :key="schema.gameId"
    class="preferences-section"
  >
    <!-- `schema.label`/`field.label` to KLUCZE i18n (por. game-prefs.catalog.ts). -->
    <h2 class="preferences-section__title">{{ $t(schema.label) }}</h2>
    <p
      v-if="gamePrefs.isLoading(schema.gameId)"
      class="preferences-section__hint"
    >{{ $t('preferences.games.loading') }}</p>

    <div
      v-for="field in schema.fields"
      :key="field.key"
      class="preferences-field"
    >
      <span class="preferences-field__label">{{ $t(field.label) }}</span>
      <UiSelect
        :modelValue="fieldValue(schema.gameId, field.key, field.default)"
        :options="fieldOptions(field.values)"
        @update:modelValue="(value: string | null) => value !== null && setFieldValue(schema.gameId, field.key, value)"
      />
      <UiSaveIndicator :saving="gamePrefs.isSaving(schema.gameId)" />
    </div>
  </section>

  <p v-if="gamePrefs.lastError" class="preferences-view__error">{{ gamePrefs.lastError }}</p>
</div>
</template>
