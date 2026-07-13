<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { useGamesStore } from '@/stores/games/games.store'
import { useCatalogStore } from '@/stores/games/catalog.store'
import { useQueueStore } from '@/stores/games/queue.store'
import { useGameLaunch } from '@/composables/useGameLaunch'
import type { Room } from '@/stores/rooms/rooms.model'
import type { CatalogGame } from '@/stores/games/catalog.model'
import QuickMatchOverlay from './QuickMatchOverlay.vue'
import ExternalGameWarning from '@/modules/games/ExternalGameWarning.vue'

/**
 * Home (Etap 3b — „nie ma pokojów, są gry"; Etap 4d/4e — katalog data-driven
 * i ranked). Grid kwadratowych kafelków: „Nowa gra" (→ `/new`), kafelki
 * „Szybki mecz" dla gier `rankedEligible` (kolejka 4e), potem moje gry w toku
 * i otwarte gry innych graczy.
 *
 * Katalog gier przychodzi subskrypcją `games` (catalog.store) — kafelek gry
 * zewnętrznej dostaje etykietę „UI poza platformą", a wejście do niej to
 * redirect na `uiUrl?handoff=…&return=…` z jednorazowym modalem ostrzegawczym
 * (useGameLaunch). Builtin wchodzi jak dotąd na `/game/rps`.
 */
const { t } = useI18n()
const rooms = useRoomsStore()
const { publicOpenRooms, myRooms, lastError } = storeToRefs(rooms)
const games = useGamesStore()
const catalog = useCatalogStore()
const queue = useQueueStore()
const launcher = useGameLaunch()

onMounted(() => {
  rooms.init()
  catalog.init()
  queue.init()
})
onUnmounted(() => {
  rooms.cleanup()
  catalog.cleanup()
  queue.cleanup()
})

// Kafelek, na który właśnie czekamy (dołączanie/handoff) — blokuje ponowny klik.
const pendingId = ref<string | null>(null)

interface MyRoomStatus {
  label: string
  /** Zakończony/anulowany mecz — kafelek znika (nie renderujemy). */
  hidden: boolean
}

/** Status kafelka mojej gry na podstawie realnej fazy meczu (Etap 3C). */
function myRoomStatus(r: Room): MyRoomStatus {
  const match = r.matchId ? games.matchById(r.matchId) : undefined
  if (!r.matchId || !match) return { label: t('home.tile.preparing'), hidden: false }

  if (match.phase === 'finished' || match.phase === 'cancelled') {
    return { label: '', hidden: true }
  }

  const roster = match.players.length + (match.guestIds?.length ?? 0)
  const capacity = match.capacity ?? 2

  // Legacy zepsuty stan: planning bez kompletu graczy nie powinien się zdarzyć.
  if (match.phase === 'planning' && roster < capacity) {
    return { label: t('home.tile.broken'), hidden: false }
  }

  if (match.phase === 'lobby') {
    return roster < capacity
      ? { label: t('home.tile.waiting', { count: roster, capacity }), hidden: false }
      : { label: t('home.tile.inProgress'), hidden: false }
  }

  // planning (pełny)/resolving/revealing/paused
  return { label: t('home.tile.inProgress'), hidden: false }
}

/** Moje kafelki po odfiltrowaniu zakończonych/anulowanych meczów (auto-hide). */
const visibleMyRooms = computed(() =>
  myRooms.value
    .map((room) => ({ room, status: myRoomStatus(room) }))
    .filter((x) => !x.status.hidden),
)

// ---- katalog data-driven (4d) ---------------------------------------------

/** Ikona kafelka wg katalogu: builtin RPS jak dotąd, zewnętrzna = glob. */
function gameIcon(gameId: string): string {
  const g = catalog.gameById(gameId)
  if (!g) return 'gamepad'
  return g.builtin ? 'hand-scissors' : 'globe'
}

/** Etykieta „UI poza platformą" — tylko gry zewnętrzne. */
function isExternalGame(gameId: string): boolean {
  return catalog.isExternal(gameId)
}

// ---- szybki mecz (4e) -------------------------------------------------------

/** Gry z kolejką rankingową (rankedEligible — dziś builtin RPS). */
const rankedGames = computed(() => catalog.rankedGames)

function quickMatch(game: CatalogGame) {
  queue.join(game._id)
}

/** Moja gra (już jestem członkiem) — wchodzę ponownie, bez ponownego dołączania. */
function enterMine(room: Room) {
  if (pendingId.value || !room.matchId) return
  pendingId.value = room._id
  rooms.enterGame(room.matchId)
}

/** Host zamyka swoją grę — kafelek zniknie wszystkim przez subskrypcję rooms/matches. */
function closeRoom(room: Room) {
  rooms.close(room._id)
}

/** Cudza otwarta gra — dołączam i od razu wchodzę. */
function joinOpen(room: Room) {
  if (pendingId.value) return
  pendingId.value = room._id
  rooms.joinAndPlay(room.code)
}

// Po `games:handoff-complete`: wejście do gry przez useGameLaunch — builtin
// pełnym przeładowaniem do `/game/rps`, zewnętrzna redirectem na `uiUrl`
// (z jednorazowym modalem ostrzegawczym przy pierwszym wejściu).
watch(
  () => rooms.lastHandoff,
  (h) => {
    if (h) launcher.launch(h)
  },
)

// Anulowany modal gry zewnętrznej — odblokuj kafelek.
watch(launcher.pendingExternal, (p, old) => {
  if (!p && old) pendingId.value = null
})

// Błąd dołączania (np. gra się właśnie zapełniła) — odblokuj kafelek.
watch(lastError, (e) => {
  if (e) pendingId.value = null
})
</script>
<template>
<div class="home-grid">
  <RouterLink to="/new" class="home-tile home-tile--new">
    <fa icon="plus" class="home-tile__icon" />
    <span class="home-tile__label">{{ $t('home.newGame') }}</span>
  </RouterLink>

  <!-- Szybki mecz (4e): kafelek per gra rankedEligible. Div z role="button"
       (jak kafelek „mojej" gry), bo w środku siedzi link do rankingu. -->
  <div
    v-for="g in rankedGames"
    :key="`quick-${g._id}`"
    class="home-tile home-tile--quick"
    :class="{ 'home-tile--pending': queue.joiningGameId === g._id }"
    role="button"
    tabindex="0"
    @click="quickMatch(g)"
    @keydown.enter="quickMatch(g)"
    @keydown.space.prevent="quickMatch(g)"
  >
    <RouterLink
      :to="`/ranking/${g._id}`"
      class="home-tile__ranking"
      :aria-label="$t('home.tile.ranking')"
      :title="$t('home.tile.ranking')"
      @click.stop
    >
      <fa icon="ranking-star" />
    </RouterLink>
    <fa icon="bolt" class="home-tile__icon" />
    <span class="home-tile__label">{{ $t('home.tile.quickMatch') }}</span>
    <span class="home-tile__meta">{{ $t('home.tile.quickMatchMeta', { game: g.name }) }}</span>
  </div>

  <div
    v-for="x in visibleMyRooms"
    :key="x.room._id"
    class="home-tile home-tile--mine"
    :class="{ 'home-tile--pending': pendingId === x.room._id }"
    role="button"
    tabindex="0"
    @click="enterMine(x.room)"
    @keydown.enter="enterMine(x.room)"
    @keydown.space.prevent="enterMine(x.room)"
  >
    <button
      v-if="rooms.isHost(x.room)"
      type="button"
      class="home-tile__close"
      :aria-label="$t('home.tile.closeGame')"
      :title="$t('home.tile.closeGame')"
      @click.stop.prevent="closeRoom(x.room)"
    >
      <fa icon="times" />
    </button>
    <fa :icon="gameIcon(x.room.gameId)" class="home-tile__icon" />
    <span class="home-tile__label">{{ x.room.name }}</span>
    <span class="home-tile__meta">{{ x.status.label }}</span>
    <span v-if="isExternalGame(x.room.gameId)" class="home-tile__ext">
      {{ $t('home.tile.external') }}
    </span>
  </div>

  <button
    v-for="r in publicOpenRooms"
    :key="r._id"
    type="button"
    class="home-tile"
    :disabled="pendingId === r._id"
    @click="joinOpen(r)"
  >
    <fa :icon="gameIcon(r.gameId)" class="home-tile__icon" />
    <span class="home-tile__label">{{ r.name }}</span>
    <span class="home-tile__meta">{{ $t('home.tile.join') }}</span>
    <span v-if="isExternalGame(r.gameId)" class="home-tile__ext">
      {{ $t('home.tile.external') }}
    </span>
  </button>
</div>

<p v-if="!visibleMyRooms.length && !publicOpenRooms.length" class="home-empty">
  {{ $t('home.empty') }}
</p>

<UiMessage v-if="lastError" type="error" class="home-error">{{ lastError }}</UiMessage>

<!-- Kolejka szybkiego meczu (4e): overlay stanu własnego wpisu queue -->
<QuickMatchOverlay />

<!-- Jednorazowe ostrzeżenie przed grą zewnętrzną (4d) -->
<ExternalGameWarning
  :pending="launcher.pendingExternal.value"
  @confirm="launcher.confirmExternal()"
  @cancel="launcher.cancelExternal()"
/>
</template>
