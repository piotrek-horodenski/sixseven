<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@/stores/games/games.model'
import { playerLabel, phaseLabel } from './rps.consts'

const props = defineProps<{
  match: Match
  meId: string | null
}>()

const opponent = computed(() => props.match.players.find((p) => p !== props.meId) ?? null)
const isActive = computed(() => !['finished', 'cancelled'].includes(props.match.phase))

const myScore = computed(() => (props.meId ? props.match.score?.[props.meId] ?? 0 : 0))
const oppScore = computed(() => (opponent.value ? props.match.score?.[opponent.value] ?? 0 : 0))

// Wynik meczu (tylko dla zakończonych): czy wygrałem.
const outcome = computed<'win' | 'loss' | 'cancelled' | null>(() => {
  if (props.match.phase === 'cancelled') return 'cancelled'
  if (props.match.phase !== 'finished') return null
  if (myScore.value === oppScore.value) return null
  return myScore.value > oppScore.value ? 'win' : 'loss'
})
</script>
<template>
<RouterLink
  class="match-card"
  :class="{ 'match-card--active': isActive }"
  :to="`/play/${match._id}`"
>
  <div class="match-card__main">
    <div class="match-card__game">
      <fa icon="hand-scissors" class="match-card__game-icon" />
      <span>vs {{ playerLabel(opponent, meId) }}</span>
    </div>
    <div class="match-card__phase">
      <span v-if="isActive" class="match-card__dot" />
      {{ phaseLabel(match.phase) }}
    </div>
  </div>

  <div class="match-card__side">
    <div class="match-card__score">
      <span class="match-card__score-me">{{ myScore }}</span>
      <span class="match-card__score-sep">:</span>
      <span>{{ oppScore }}</span>
    </div>
    <span
      v-if="outcome === 'win'"
      class="match-card__badge match-card__badge--win"
    >Wygrana</span>
    <span
      v-else-if="outcome === 'loss'"
      class="match-card__badge match-card__badge--loss"
    >Przegrana</span>
    <span
      v-else-if="outcome === 'cancelled'"
      class="match-card__badge"
    >Anulowany</span>
    <fa v-else icon="caret-right" class="match-card__go" />
  </div>
</RouterLink>
</template>
