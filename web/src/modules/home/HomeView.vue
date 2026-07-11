<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import type { Room } from '@/stores/rooms/rooms.model'

/**
 * Home (Etap 3b — „nie ma pokojów, są gry"). Grid kwadratowych kafelków:
 * pierwszy = „Nowa gra" (→ `/new`), potem moje gry w toku i otwarte gry
 * innych graczy. Klik w kafelek gry = wejście na ekran gry (`/game/rps`),
 * BEZ pośredniego ekranu szczegółów pokoju (dawny `RoomDetail` zniknął).
 */
const rooms = useRoomsStore()
const { publicOpenRooms, myRooms, lastError } = storeToRefs(rooms)

onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

// Kafelek, na który właśnie czekamy (dołączanie/handoff) — blokuje ponowny klik.
const pendingId = ref<string | null>(null)

function statusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Czekam na przeciwnika'
    case 'matched':
      return 'Mecz trwa'
    default:
      return status
  }
}

/** Moja gra (już jestem członkiem) — wchodzę ponownie, bez ponownego dołączania. */
function enterMine(room: Room) {
  if (pendingId.value || !room.matchId) return
  pendingId.value = room._id
  rooms.enterGame(room.matchId)
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

  <button
    v-for="r in myRooms"
    :key="r._id"
    type="button"
    class="home-tile home-tile--mine"
    :disabled="pendingId === r._id"
    @click="enterMine(r)"
  >
    <fa icon="hand-scissors" class="home-tile__icon" />
    <span class="home-tile__label">{{ r.name }}</span>
    <span class="home-tile__meta">{{ statusLabel(r.status) }}</span>
  </button>

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

<p v-if="!myRooms.length && !publicOpenRooms.length" class="home-empty">
  Brak otwartych gier — załóż nową!
</p>

<UiMessage v-if="lastError" type="error" class="home-error">{{ lastError }}</UiMessage>
</template>
