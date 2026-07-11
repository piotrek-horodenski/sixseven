<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { useGamesStore } from '@/stores/games/games.store'
import type { Room } from '@/stores/rooms/rooms.model'

/**
 * Home (Etap 3b — „nie ma pokojów, są gry"). Grid kwadratowych kafelków:
 * pierwszy = „Nowa gra" (→ `/new`), potem moje gry w toku i otwarte gry
 * innych graczy. Klik w kafelek gry = wejście na ekran gry (`/game/rps`),
 * BEZ pośredniego ekranu szczegółów pokoju (dawny `RoomDetail` zniknął).
 *
 * Status kafelka MOJEJ gry (Etap 3C) liczymy z realnego meczu
 * (`useGamesStore().matchById`, subskrybowany w `AppLayout` — tu tylko
 * czytamy getter, nie ruszamy cyklu życia `games.store`).
 */
const rooms = useRoomsStore()
const { publicOpenRooms, myRooms, lastError } = storeToRefs(rooms)
const games = useGamesStore()

onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

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
  if (!r.matchId || !match) return { label: 'Przygotowanie…', hidden: false }

  if (match.phase === 'finished' || match.phase === 'cancelled') {
    return { label: '', hidden: true }
  }

  const roster = match.players.length + (match.guestIds?.length ?? 0)
  const capacity = match.capacity ?? 2

  // Legacy zepsuty stan: planning bez kompletu graczy nie powinien się zdarzyć.
  if (match.phase === 'planning' && roster < capacity) {
    return { label: 'Zepsuta', hidden: false }
  }

  if (match.phase === 'lobby') {
    return roster < capacity
      ? { label: `Czeka na graczy (${roster}/${capacity})`, hidden: false }
      : { label: 'W toku', hidden: false }
  }

  // planning (pełny)/resolving/revealing/paused
  return { label: 'W toku', hidden: false }
}

/** Moje kafelki po odfiltrowaniu zakończonych/anulowanych meczów (auto-hide). */
const visibleMyRooms = computed(() =>
  myRooms.value
    .map((room) => ({ room, status: myRoomStatus(room) }))
    .filter((x) => !x.status.hidden),
)

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

// Po `games:handoff-complete`: pełne przeładowanie do aplikacji gry (osobny
// socket meczu) — ten sam wzorzec co reszta wejść do `/game/rps`.
watch(
  () => rooms.lastHandoff,
  (h) => {
    if (h) {
      window.location.href = `/game/rps?handoff=${encodeURIComponent(h.code)}&return=/`
    }
  },
)

// Błąd dołączania (np. gra się właśnie zapełniła) — odblokuj kafelek.
watch(lastError, (e) => {
  if (e) pendingId.value = null
})
</script>
<template>
<div class="home-grid">
  <RouterLink to="/new" class="home-tile home-tile--new">
    <fa icon="plus" class="home-tile__icon" />
    <span class="home-tile__label">Nowa gra</span>
  </RouterLink>

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
      aria-label="Zamknij grę"
      title="Zamknij grę"
      @click.stop.prevent="closeRoom(x.room)"
    >
      <fa icon="times" />
    </button>
    <fa icon="hand-scissors" class="home-tile__icon" />
    <span class="home-tile__label">{{ x.room.name }}</span>
    <span class="home-tile__meta">{{ x.status.label }}</span>
  </div>

  <button
    v-for="r in publicOpenRooms"
    :key="r._id"
    type="button"
    class="home-tile"
    :disabled="pendingId === r._id"
    @click="joinOpen(r)"
  >
    <fa icon="hand-scissors" class="home-tile__icon" />
    <span class="home-tile__label">{{ r.name }}</span>
    <span class="home-tile__meta">Dołącz</span>
  </button>
</div>

<p v-if="!visibleMyRooms.length && !publicOpenRooms.length" class="home-empty">
  Brak otwartych gier — załóż nową!
</p>

<UiMessage v-if="lastError" type="error" class="home-error">{{ lastError }}</UiMessage>
</template>
