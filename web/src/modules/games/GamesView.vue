<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useGamesStore } from '@/stores/games/games.store'
import MatchCard from './MatchCard.vue'

// Subskrypcja startuje w AppLayout (jak color-presets) — tu tylko czytamy stan.
// Wejście do gry idzie przez Pokoje (link), nie przez wpisywanie id.
const games = useGamesStore()
const { activeMatches, finishedMatches, currentUserId } = storeToRefs(games)
</script>
<template>
<div class="games-lobby">
  <RouterLink to="/rooms" class="games-lobby__cta">
    <span class="games-lobby__cta-icon"><fa icon="door-open" /></span>
    <span class="games-lobby__cta-text">
      <strong>Zagraj z kimś</strong>
      <small>Utwórz pokój i podziel się linkiem — pierwszy, kto dołączy, jest Twoim przeciwnikiem.</small>
    </span>
    <fa icon="caret-right" class="games-lobby__cta-go" />
  </RouterLink>

  <section class="games-lobby__section">
    <h2 class="games-lobby__heading">
      <fa icon="hourglass-half" /> W toku
      <span class="games-lobby__count">{{ activeMatches.length }}</span>
    </h2>
    <p v-if="!activeMatches.length" class="games-lobby__empty">
      Brak aktywnych meczów. Utwórz pokój, żeby zacząć grę.
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
