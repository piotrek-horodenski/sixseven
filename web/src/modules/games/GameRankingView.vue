<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCollection, type UseCollection } from '@/composables/useCollection'
import { useCatalogStore } from '@/stores/games/catalog.store'
import { RATING_TOP_LIMIT, type Rating } from '@/stores/games/ranked.model'
import { shortId } from '@/modules/games/rps.consts'

/**
 * Prosty ranking gry (`/ranking/:gameId`, Etap 4e) — top 50 wg ELO.
 * Subskrypcja publicznej kolekcji `ratings` z filtrem `{ gameId }`, sortowanie
 * i limit PO STRONIE KLIENTA (kontrakt §4). Minimalistycznie: pozycja, gracz
 * (link do profilu publicznego), ELO, liczba meczów. Nazwa gry z katalogu
 * (subskrypcja `games` przez catalog.store).
 */
const route = useRoute()
const catalog = useCatalogStore()

const gameId = computed<string>(() => String(route.params.gameId || ''))
const game = computed(() => catalog.gameById(gameId.value))
const gameName = computed(() => game.value?.name ?? gameId.value)

// Kolekcja w shallowRef — restart subskrypcji przy zmianie gameId (wzorzec
// annotations z PlayerProfileView).
const ratingsCol = shallowRef<UseCollection<Rating> | null>(null)

const topRows = computed<Rating[]>(() =>
  [...(ratingsCol.value?.docs.value ?? [])]
    .sort((a, b) => b.elo - a.elo || b.matches - a.matches)
    .slice(0, RATING_TOP_LIMIT),
)

function startRatings() {
  ratingsCol.value?.stop()
  if (!gameId.value) return
  const c = useCollection<Rating>('ratings', { gameId: gameId.value })
  ratingsCol.value = c
  c.start()
}

onMounted(() => {
  catalog.init()
  startRatings()
})

watch(gameId, (next, prev) => {
  if (next && next !== prev) startRatings()
})

onUnmounted(() => {
  ratingsCol.value?.stop()
  ratingsCol.value = null
  catalog.cleanup()
})
</script>
<template>
<div class="game-ranking">
  <header class="game-ranking__header">
    <fa icon="ranking-star" class="game-ranking__glyph" />
    <div>
      <h1 class="game-ranking__title">{{ $t('games.ranking.title', { game: gameName }) }}</h1>
      <p class="game-ranking__subtitle">{{ $t('games.ranking.subtitle', { limit: RATING_TOP_LIMIT }) }}</p>
    </div>
  </header>

  <p v-if="!topRows.length" class="game-ranking__empty">{{ $t('games.ranking.empty') }}</p>

  <table v-else class="game-ranking__table">
    <thead>
      <tr>
        <th>{{ $t('games.ranking.position') }}</th>
        <th>{{ $t('games.ranking.player') }}</th>
        <th>{{ $t('games.ranking.elo') }}</th>
        <th>{{ $t('games.ranking.matches') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, i) in topRows" :key="r._id">
        <td class="game-ranking__pos">{{ i + 1 }}</td>
        <td>
          <RouterLink :to="`/u/${r.userId}`" class="game-ranking__player">
            {{ shortId(r.userId) }}
          </RouterLink>
        </td>
        <td class="game-ranking__elo">{{ r.elo }}</td>
        <td>{{ r.matches }}</td>
      </tr>
    </tbody>
  </table>
</div>
</template>
