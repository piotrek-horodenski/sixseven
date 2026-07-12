<script setup lang="ts">

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FriendPresence } from '@/stores/social/social.model'

/**
 * Kropka statusu obecności znajomego (online / w poczekalni / w grze / offline).
 * Kolor steruje klasa modyfikatora; etykieta idzie do `title`/`aria-label`, więc
 * status jest czytelny także dla czytników ekranu, nie tylko przez kolor.
 */
const props = defineProps<{
  status: FriendPresence
}>()

const { t } = useI18n()

const label = computed(() => t(`social.status.${props.status}`))

</script>
<template>
<span
  class="friend-status-dot"
  :class="`friend-status-dot--${props.status}`"
  role="img"
  :title="label"
  :aria-label="label"
/>
</template>
