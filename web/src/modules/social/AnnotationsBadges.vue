<script setup lang="ts">
import { computed } from 'vue'
import type { Annotation } from '@/stores/social/community.model'

/**
 * Sekcja odznak (adnotacji) na profilu publicznym. Dane pochodzą z SUBSKRYPCJI
 * `annotations` — polityka gate przepuszcza tylko `positive` (publiczne) oraz
 * własne (dowolny sentyment). Komponent nie robi żadnego dodatkowego filtrowania
 * poza sortowaniem po dacie; NIE zakłada, że dostał komplet (row-level po serwerze).
 */
const props = defineProps<{
  badges: Annotation[]
}>()

const sorted = computed(() =>
  [...props.badges].sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0)),
)

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString()
}
</script>
<template>
<div class="profile-badges">
  <p v-if="!sorted.length" class="profile-badges__empty">
    {{ $t('community.profile.badgesEmpty') }}
  </p>
  <ul v-else class="profile-badges__list">
    <li
      v-for="b in sorted"
      :key="b._id"
      class="profile-badge"
      :class="`profile-badge--${b.sentiment}`"
      :title="formatDate(b.earnedAt)"
    >
      <fa icon="award" class="profile-badge__icon" />
      <span class="profile-badge__label">{{ b.badgeId }}</span>
    </li>
  </ul>
</div>
</template>
