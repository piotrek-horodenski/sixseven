<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { useTokenSocket, type TokenSocket } from '@/composables/useTokenSocket'
import type { Room } from '@/stores/rooms/rooms.model'
import { EMessageType } from '@/controls/controls.model'

/**
 * Wejście z linku `/r/:code` (publiczne, poza AppLayout).
 *  - Zalogowany  → `rooms.joinAndPlay(code)` (join + auto request-handoff) →
 *    pełne przeładowanie do `/game/rps` (ten sam kontrakt URL co reszta gry).
 *  - Niezalogowany → formularz nicku → `POST /rooms/join-guest` → guest token
 *    (osobny klucz localStorage) → cienki socket gościa (`useTokenSocket`)
 *    subskrybuje `rooms`; gdy tylko subskrypcja przyniesie `matchId`, gość
 *    dostaje handoff automatycznie (bez dodatkowego klikania).
 */

const GUEST_TOKEN_KEY = 'hydra_guest_token'
const httpBase = import.meta.env.VITE_GATE_HTTP_URL || 'https://localhost:4114'

const { t } = useI18n()
const route = useRoute()
const gate = useGateStore()
const rooms = useRoomsStore()
const { lastError: roomsError } = storeToRefs(rooms)

const code = computed(() => String(route.params.code || '').toUpperCase())
const isUser = computed(() => gate.isAuthenticated)

// =====================================================================
// Ścieżka zalogowanego usera
// =====================================================================
onMounted(() => {
  if (isUser.value) {
    rooms.init()
    rooms.joinAndPlay(code.value)
  }
})

watch(
  () => rooms.lastHandoff,
  (h) => {
    if (h && isUser.value) {
      window.location.href = `/game/rps?handoff=${encodeURIComponent(h.code)}&return=/`
    }
  },
)

// =====================================================================
// Ścieżka gościa
// =====================================================================
type GuestPhase = 'form' | 'joining' | 'joined' | 'error'
const guestPhase = ref<GuestPhase>('form')
const nick = ref('')
const guestError = ref<string | null>(null)

const guestId = ref<string | null>(null)
const guestRoomId = ref<string | null>(null)
let guestClient: TokenSocket | null = null
const guestRooms = ref<Room[]>([])

const guestRoom = computed(() => guestRooms.value.find((r) => r._id === guestRoomId.value) ?? null)

const nickValid = () => nick.value.trim().length >= 2

async function joinAsGuest() {
  if (!nickValid() || guestPhase.value === 'joining') return
  guestPhase.value = 'joining'
  guestError.value = null
  try {
    const res = await fetch(`${httpBase}/rooms/join-guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.value, nick: nick.value.trim() }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || t('rooms.errors.join'))
    }
    const data = (await res.json()) as {
      token: string
      roomId: string
      guestId: string
      gameId: string
    }
    // Osobny klucz — NIE nadpisujemy sesji zalogowanego usera ('hydra_token').
    localStorage.setItem(
      GUEST_TOKEN_KEY,
      JSON.stringify({
        token: data.token,
        roomId: data.roomId,
        guestId: data.guestId,
        gameId: data.gameId,
        code: code.value,
      }),
    )
    guestId.value = data.guestId
    guestRoomId.value = data.roomId
    connectGuest(data.token)
    guestPhase.value = 'joined'
  } catch (e: any) {
    guestPhase.value = 'error'
    guestError.value = e?.message || t('rooms.errors.join')
  }
}

function connectGuest(token: string) {
  guestClient = useTokenSocket(token)
  guestClient.subscribe<Room>('rooms', {}, guestRooms)
  // connect() najpierw — on() bez żywego socketu nie podpiąłby listenera.
  guestClient.connect()
  guestClient.on('games:handoff-complete', onGuestHandoff)
  guestClient.on('games:handoff-error', ({ message }: { message?: string }) => {
    guestError.value = message || t('rooms.errors.handoff')
    goingToGame.value = false
  })
}

const goingToGame = ref(false)
function guestPlay() {
  if (!guestRoom.value?.matchId || goingToGame.value) return
  goingToGame.value = true
  guestClient?.call('games:request-handoff', { matchId: guestRoom.value.matchId })
}
function onGuestHandoff(h: { code: string; gameId: string; playerId: string }) {
  goingToGame.value = false
  window.location.href = `/game/rps?handoff=${encodeURIComponent(h.code)}&return=${encodeURIComponent(`/r/${code.value}`)}`
}

// Mecz istnieje od razu (host go założył przy tworzeniu gry) — jak tylko
// subskrypcja przyniesie `matchId`, gość dostaje handoff automatycznie, bez
// dodatkowego klikania „Graj" (spójne z kaflem na Home).
watch(guestRoom, (r) => {
  if (r?.matchId && guestPhase.value === 'joined' && !goingToGame.value) {
    guestPlay()
  }
})

onUnmounted(() => {
  if (isUser.value) rooms.cleanup()
  guestClient?.disconnect()
  guestClient = null
})
</script>
<template>
<div class="room-join">
  <!-- Zalogowany user: dołączamy w tle i przechodzimy do gry. -->
  <div v-if="isUser" class="room-join__panel room-join__panel--center">
    <template v-if="roomsError">
      <fa icon="times-circle" class="room-join__glyph room-join__glyph--error" />
      <h1 class="room-join__title">{{ $t('rooms.join.failedTitle') }}</h1>
      <p class="room-join__text">{{ roomsError }}</p>
      <RouterLink to="/" class="room-join__link">{{ $t('rooms.join.toHome') }}</RouterLink>
    </template>
    <template v-else>
      <fa icon="circle-notch" class="rotate room-join__glyph" />
      <i18n-t keypath="rooms.join.joining" tag="p" class="room-join__text" scope="global">
        <template #code><strong>{{ code }}</strong></template>
      </i18n-t>
    </template>
  </div>

  <!-- Gość: formularz nicku -->
  <div v-else-if="guestPhase === 'form' || guestPhase === 'joining' || guestPhase === 'error'" class="room-join__panel">
    <fa icon="door-open" class="room-join__glyph" />
    <h1 class="room-join__title">{{ $t('rooms.join.title') }}</h1>
    <i18n-t keypath="rooms.join.invited" tag="p" class="room-join__text" scope="global">
      <template #code><strong>{{ code }}</strong></template>
    </i18n-t>

    <form class="room-join__form" @submit.prevent="joinAsGuest">
      <UiInput
        v-model="nick"
        :placeholder="$t('rooms.join.nickPlaceholder')"
        autocomplete="off"
        maxlength="24"
      >
        {{ $t('rooms.join.nickLabel') }}
      </UiInput>

      <UiMessage v-if="guestError" :type="EMessageType.error">{{ guestError }}</UiMessage>

      <UiButton
        type="submit"
        icon="play"
        :loading="guestPhase === 'joining'"
        :disabled="!nickValid() || guestPhase === 'joining'"
      >
        {{ $t('rooms.join.joinAsGuest') }}
      </UiButton>
    </form>

    <RouterLink to="/login" class="room-join__alt">{{ $t('rooms.join.haveAccount') }}</RouterLink>
  </div>

  <!-- Gość: widok gry (dołączam → od razu handoff, bez dodatkowego klikania) -->
  <div v-else class="room-join__panel">
    <template v-if="guestRoom">
      <h1 class="room-join__title">{{ guestRoom.name }}</h1>
      <i18n-t keypath="rooms.join.gameCode" tag="p" class="room-join__text" scope="global">
        <template #code><strong>{{ guestRoom.code }}</strong></template>
      </i18n-t>

      <ul class="room-join__member-list room-join__members">
        <li
          v-for="m in guestRoom.members"
          :key="m.id"
          class="room-member"
          :class="{ 'room-member--me': m.id === guestId }"
        >
          <fa :icon="m.kind === 'guest' ? 'mask' : 'user'" class="room-member__icon" />
          <span class="room-member__nick">{{ m.nick }}</span>
          <span v-if="m.id === guestRoom.hostId" class="room-member__host">{{ $t('rooms.join.hostBadge') }}</span>
          <span v-if="m.kind === 'guest'" class="room-member__tag">{{ $t('rooms.join.guestBadge') }}</span>
        </li>
      </ul>

      <UiMessage v-if="guestError" :type="EMessageType.error">{{ guestError }}</UiMessage>
      <UiButton
        v-if="guestError"
        icon="gamepad"
        :loading="goingToGame"
        @click="guestPlay"
      >{{ $t('rooms.join.retry') }}</UiButton>
      <p v-else class="room-join__text room-join__waiting">
        <fa icon="circle-notch" class="rotate" />
        {{ $t('rooms.join.connecting') }}
      </p>
    </template>
    <div v-else class="room-join__panel--center">
      <fa icon="circle-notch" class="rotate room-join__glyph" />
      <p class="room-join__text">{{ $t('rooms.join.loading') }}</p>
    </div>
  </div>
</div>
</template>
