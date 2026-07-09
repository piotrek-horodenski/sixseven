<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGamesStore } from '@/stores/games/games.store'
import { playerLabel } from './rps.consts'
import RpsBoard from './RpsBoard.vue'

const route = useRoute()
const games = useGamesStore()
const { currentUserId, started } = storeToRefs(games)

const matchId = computed(() => String(route.params.id))
const match = computed(() => games.matchById(matchId.value))
const opponent = computed(() => games.opponentId(match.value))

const target = computed(() => Number(match.value?.options?.target) || 2)
const myScore = computed(() =>
  currentUserId.value ? match.value?.score?.[currentUserId.value] ?? 0 : 0,
)
const oppScore = computed(() =>
  opponent.value ? match.value?.score?.[opponent.value] ?? 0 : 0,
)
</script>
<template>
<div class="match-screen">
  <header class="match-screen__header">
    <RouterLink to="/play" class="match-screen__back">
      <fa icon="caret-left" /> Lista
    </RouterLink>

    <div v-if="match" class="match-screen__scoreboard">
      <div class="score-chip score-chip--me">
        <span class="score-chip__name">Ty</span>
        <span class="score-chip__val">{{ myScore }}</span>
      </div>
      <span class="match-screen__target">do {{ target }}</span>
      <div class="score-chip">
        <span class="score-chip__name">{{ playerLabel(opponent, currentUserId) }}</span>
        <span class="score-chip__val">{{ oppScore }}</span>
      </div>
    </div>
  </header>

  <RpsBoard v-if="match" :match="match" />

  <div v-else class="match-screen__missing">
    <template v-if="started">
      <fa icon="circle-notch" class="rotate" />
      <p>Ładuję mecz…</p>
      <p class="match-screen__missing-hint">
        Jeśli to nie Twój mecz, nie zobaczysz go tutaj.
      </p>
      <RouterLink to="/play" class="match-screen__missing-link">Wróć do listy</RouterLink>
    </template>
  </div>
</div>
</template>
