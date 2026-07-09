<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import CreateRoomForm from './CreateRoomForm.vue'

// AppLayout jest współdzielony, więc subskrypcję pokoi startujemy tutaj
// (refcount w store obsłuży nakładanie się z RoomDetail).
const rooms = useRoomsStore()
const { publicOpenRooms, myRooms } = storeToRefs(rooms)

onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

function statusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Otwarty'
    case 'matched':
      return 'Mecz trwa'
    case 'closed':
      return 'Zamknięty'
    default:
      return status
  }
}
</script>
<template>
<div class="rooms-hub">
  <section class="rooms-hub__create">
    <CreateRoomForm />
  </section>

  <section class="rooms-hub__section">
    <h2 class="rooms-hub__heading">
      <fa icon="users" /> Moje pokoje
      <span class="rooms-hub__count">{{ myRooms.length }}</span>
    </h2>
    <p v-if="!myRooms.length" class="rooms-hub__empty">
      Nie należysz jeszcze do żadnego pokoju. Utwórz nowy powyżej.
    </p>
    <ul v-else class="rooms-hub__list">
      <li v-for="r in myRooms" :key="r._id">
        <RouterLink class="room-card room-card--mine" :to="`/rooms/${r._id}`">
          <div class="room-card__main">
            <span class="room-card__name">
              <fa icon="hand-scissors" class="room-card__game-icon" />
              {{ r.name }}
            </span>
            <span class="room-card__meta">
              <span class="room-card__code">{{ r.code }}</span>
              <span class="room-card__dot-sep">·</span>
              {{ r.members.length }}
              <fa icon="user" class="room-card__meta-icon" />
            </span>
          </div>
          <div class="room-card__side">
            <span
              class="room-card__badge"
              :class="`room-card__badge--${r.status}`"
            >{{ statusLabel(r.status) }}</span>
            <fa icon="caret-right" class="room-card__go" />
          </div>
        </RouterLink>
      </li>
    </ul>
  </section>

  <section class="rooms-hub__section">
    <h2 class="rooms-hub__heading">
      <fa icon="globe" /> Publiczne otwarte
      <span class="rooms-hub__count">{{ publicOpenRooms.length }}</span>
    </h2>
    <p v-if="!publicOpenRooms.length" class="rooms-hub__empty">
      Brak publicznych pokoi do dołączenia.
    </p>
    <ul v-else class="rooms-hub__list">
      <li v-for="r in publicOpenRooms" :key="r._id">
        <RouterLink class="room-card" :to="`/rooms/${r._id}`">
          <div class="room-card__main">
            <span class="room-card__name">
              <fa icon="hand-scissors" class="room-card__game-icon" />
              {{ r.name }}
            </span>
            <span class="room-card__meta">
              {{ r.members.length }}
              <fa icon="user" class="room-card__meta-icon" />
              w środku
            </span>
          </div>
          <div class="room-card__side">
            <span class="room-card__join">Dołącz</span>
            <fa icon="caret-right" class="room-card__go" />
          </div>
        </RouterLink>
      </li>
    </ul>
  </section>
</div>
</template>
