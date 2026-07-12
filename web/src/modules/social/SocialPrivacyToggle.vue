<script setup lang="ts">

import { computed, onMounted, onUnmounted } from 'vue'
import { useSocialStore } from '@/stores/social/social.store'

/**
 * Przełącznik trybu niewidzialnego (przeznaczony do `PreferencesView`). Gdy
 * włączony, gate degraduje presence do „online" i nie ujawnia `currentMatchId`.
 * Wołanie idzie przez `social.store.setInvisible` (komenda `presence:set-invisible`),
 * a wartość potwierdza ack. Layout wiersza spójny z `PreferencesView`
 * (`preferences-field--inline`).
 */

const store = useSocialStore()

const invisible = computed<boolean>({
  get: () => store.invisible,
  set: (value) => store.setInvisible(value),
})

onMounted(() => store.init())
onUnmounted(() => store.cleanup())

</script>
<template>
<div class="preferences-field preferences-field--inline">
  <span class="preferences-field__label">{{ $t('social.privacy.invisible') }}</span>
  <UiSwitch v-model="invisible" />
</div>
</template>
