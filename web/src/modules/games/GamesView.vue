<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGamesStore } from '@/stores/games/games.store'
import MatchCard from './MatchCard.vue'
import CreateMatchForm from './CreateMatchForm.vue'

// Subskrypcja startuje w AppLayout (jak color-presets) — tu tylko czytamy stan.
const games = useGamesStore()
const { activeMatches, finishedMatches, currentUserId } = storeToRefs(games)
</script>
<template>
<div class="games-lobby">
  <section class="games-lobby__create">
    <CreateMatchForm />
  </section>

  <section class="games-lobby__section">
    <h2 class="games-lobby__heading">
      <fa icon="hourglass-half" /> W toku
      <span class="games-lobby__count">{{ activeMatches.length }}</span>
    </h2>
    <p v-if="!activeMatches.length" class="games-lobby__empty">
      Brak aktywnych meczów. Utwórz nowy powyżej.
    </p>
    <ul v-else class="games-lobby__list">
      <li v-for="m in activeMatches" :key="m._id">
        <MatchCard :match="m" :me-id="currentUserId" />
      </li>
    </ul>
  </section>

  <section v-if="finishedMatches.length" class="games-lobby__section">
    <h2 class="games-lobby__heading">
      <fa icon="trophy" /> Zakończone
      <span class="games-lobby__count">{{ finishedMatches.length }}</span>
    </h2>
    <ul class="games-lobby__list">
      <li v-for="m in finishedMatches" :key="m._id">
        <MatchCard :match="m" :me-id="currentUserId" />
      </li>
    </ul>
  </section>
</div>
</template>
