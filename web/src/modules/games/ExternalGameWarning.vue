<script setup lang="ts">
import { computed } from 'vue'
import { EPopupSize } from '@/controls/controls.model'
import type { PendingExternalLaunch } from '@/composables/useGameLaunch'

/**
 * Jednorazowy modal ostrzegawczy przed wejściem do gry zewnętrznej (4d).
 * Stan (oczekujące wejście) dostarcza `useGameLaunch` — komponent tylko
 * renderuje ostrzeżenie („gra NIGDY nie prosi o hasło platformy") i oddaje
 * decyzję rodzicowi (confirm → zapis localStorage + redirect, cancel → nic).
 */
const props = defineProps<{
  pending: PendingExternalLaunch | null
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const show = computed(() => !!props.pending)
</script>
<template>
<UiPopup :show="show" :size="EPopupSize.thin" @update:show="emit('cancel')">
  <template #title>{{ $t('games.catalog.externalWarnTitle') }}</template>
  <div class="external-warn">
    <fa icon="arrow-up-right-from-square" class="external-warn__glyph" />
    <p class="external-warn__body">
      {{ $t('games.catalog.externalWarnBody', { name: props.pending?.game.name ?? '' }) }}
    </p>
    <div class="external-warn__actions">
      <UiButton class="accent" @click="emit('cancel')">
        {{ $t('games.catalog.externalWarnCancel') }}
      </UiButton>
      <UiButton icon="arrow-up-right-from-square" @click="emit('confirm')">
        {{ $t('games.catalog.externalWarnConfirm') }}
      </UiButton>
    </div>
  </div>
</UiPopup>
</template>
