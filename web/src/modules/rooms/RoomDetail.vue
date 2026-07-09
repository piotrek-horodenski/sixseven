<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { playerLabel } from '@/modules/games/rps.consts'

const route = useRoute()
const router = useRouter()
const rooms = useRoomsStore()
const { started, lastError, lastLeftRoomId, lastHandoff, currentUserId } = storeToRefs(rooms)

onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

const roomId = computed(() => String(route.params.id))
const room = computed(() => rooms.roomById(roomId.value))
const iAmHost = computed(() => rooms.isHost(room.value))

const shareLink = computed(() =>
  room.value ? `${window.location.origin}/r/${room.value.code}` : '',
)
const canStart = computed(
  () => iAmHost.value && room.value?.status === 'open' && (room.value?.members.length ?? 0) >= 2,
)
const isMatched = computed(() => room.value?.status === 'matched' && !!room.value?.matchId)

// ---- kopiowanie linku --------------------------------------------------
const copied = ref(false)
let copyTimer: number | undefined
async function copyLink() {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* schowek niedostępny — użytkownik może skopiować ręcznie z pola */
  }
}

// ---- akcje -------------------------------------------------------------
function start() {
  if (!room.value) return
  rooms.start(room.value._id)
}

const goingToGame = ref(false)
function play() {
  if (!room.value?.matchId) return
  goingToGame.value = true
  rooms.requestHandoff(room.value.matchId)
}

// Po handoff-complete: pełne przeładowanie do aplikacji gry (osobny socket meczu).
watch(lastHandoff, (h) => {
  if (h && goingToGame.value) {
    goingToGame.value = false
    window.location.href = `/game/rps?handoff=${encodeURIComponent(h.code)}&return=${encodeURIComponent(`/rooms/${roomId.value}`)}`
  }
})

const leaving = ref(false)
function leave() {
  if (!room.value) return
  leaving.value = true
  rooms.leave(room.value._id)
}
watch(lastLeftRoomId, (id) => {
  if (id && id === roomId.value && leaving.value) {
    leaving.value = false
    router.push('/rooms')
  }
})

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>
<template>
<div class="room-detail">
  <RouterLink to="/rooms" class="room-detail__back">
    <fa icon="caret-left" /> Pokoje
  </RouterLink>

  <template v-if="room">
    <header class="room-detail__header">
      <h1 class="room-detail__name">{{ room.name }}</h1>
      <span
        class="room-card__badge"
        :class="`room-card__badge--${room.status}`"
      >{{ room.status === 'open' ? 'Otwarty' : room.status === 'matched' ? 'Mecz trwa' : 'Zamknięty' }}</span>
    </header>

    <section class="room-detail__share">
      <label class="room-detail__share-label">Zaproś linkiem</label>
      <div class="room-detail__share-row">
        <input class="room-detail__share-input" :value="shareLink" readonly @focus="($event.target as HTMLInputElement).select()" />
        <UiButton icon="copy" @click="copyLink">{{ copied ? 'Skopiowano' : 'Kopiuj' }}</UiButton>
      </div>
      <p class="room-detail__code">Kod: <strong>{{ room.code }}</strong></p>
    </section>

    <section class="room-detail__members">
      <h2 class="room-detail__subhead">
        <fa icon="users" /> Gracze
        <span class="rooms-hub__count">{{ room.members.length }}</span>
      </h2>
      <ul class="room-detail__member-list">
        <li
          v-for="m in room.members"
          :key="m.id"
          class="room-member"
          :class="{ 'room-member--me': m.id === currentUserId }"
        >
          <fa :icon="m.kind === 'guest' ? 'mask' : 'user'" class="room-member__icon" />
          <span class="room-member__nick">{{ m.nick || playerLabel(m.id, currentUserId) }}</span>
          <span v-if="m.id === room.hostId" class="room-member__host">host</span>
          <span v-if="m.kind === 'guest'" class="room-member__tag">gość</span>
        </li>
      </ul>
    </section>

    <UiMessage v-if="lastError" type="error">{{ lastError }}</UiMessage>

    <section class="room-detail__actions">
      <UiButton
        v-if="isMatched"
        icon="gamepad"
        :loading="goingToGame"
        @click="play"
      >Graj</UiButton>

      <template v-else-if="iAmHost">
        <UiButton
          icon="play"
          :disabled="!canStart"
          @click="start"
        >Start</UiButton>
        <p v-if="!canStart" class="room-detail__hint">
          Potrzeba co najmniej 2 graczy, żeby wystartować.
        </p>
      </template>

      <p v-else-if="room.status === 'open'" class="room-detail__hint">
        Czekaj, aż host wystartuje mecz.
      </p>

      <button class="room-detail__leave" type="button" :disabled="leaving" @click="leave">
        <fa icon="sign-out-alt" /> Opuść pokój
      </button>
    </section>
  </template>

  <div v-else class="room-detail__missing">
    <template v-if="started">
      <fa icon="circle-notch" class="rotate" />
      <p>Ładuję pokój…</p>
      <p class="room-detail__missing-hint">
        Jeśli to nie Twój pokój lub został zamknięty, nie zobaczysz go tutaj.
      </p>
      <RouterLink to="/rooms" class="room-detail__missing-link">Wróć do listy</RouterLink>
    </template>
  </div>
</div>
</template>
