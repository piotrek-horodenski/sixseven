<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { RPS_GAME_ID } from '@/stores/rooms/rooms.model'
import { EMessageType } from '@/controls/controls.model'

/**
 * Ekran tworzenia gry (`/new`, Etap 3b — zastępuje dawny `CreateRoomForm`
 * osadzony w hubie). Struktura ma miejsce na przyszłe gry/warianty graczy,
 * ale dziś jest tylko jedna opcja każdego wyboru (zablokowane).
 *
 * Po „Utwórz": `rooms.createAndPlay(...)` tworzy pokój+mecz i sam poprosi o
 * handoff, gdy tylko przyjdzie `matchId` (patrz `rooms.store`). Tu tylko
 * czekamy na `lastHandoff` i robimy pełne przeładowanie do `/game/rps` —
 * dokładnie ten sam kontrakt URL, co reszta wejść do gry.
 */

type GameOption = { id: string; label: string; icon: string }

const GAME_OPTIONS: GameOption[] = [
  { id: RPS_GAME_ID, label: 'Papier / kamień / nożyce', icon: 'hand-scissors' },
]
const PLAYER_COUNT_OPTIONS = [2]

const gate = useGateStore()
const rooms = useRoomsStore()
const { creating, lastError } = storeToRefs(rooms)

// Widok może być wejściem bezpośrednim (nie tylko z Home) — refcount w store
// (por. `rooms.store.ts`) obsłuży nakładanie się z Home, gdyby oba były aktywne.
onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

const selectedGameId = ref(GAME_OPTIONS[0].id)
const selectedPlayers = ref(PLAYER_COUNT_OPTIONS[0])

const awaitingHandoff = ref(false)

function submit() {
  if (creating.value || awaitingHandoff.value) return
  awaitingHandoff.value = true
  const author = gate.user?.profile?.display || gate.user?.username || 'gracza'
  rooms.createAndPlay(`Gra ${author}`, 'public', selectedGameId.value)
}

// Po `games:handoff-complete`: pełne przeładowanie do aplikacji gry (osobny
// socket meczu) — ten sam wzorzec co reszta wejść do `/game/rps`.
watch(
  () => rooms.lastHandoff,
  (h) => {
    if (h && awaitingHandoff.value) {
      awaitingHandoff.value = false
      window.location.href = `/game/rps?handoff=${encodeURIComponent(h.code)}&return=/`
    }
  },
)

watch(selectedGameId, () => {
  if (lastError.value) rooms.clearError()
})
</script>
<template>
<div class="create-game">
  <h2 class="create-game__title">Nowa gra</h2>

  <div class="create-game__field">
    <span class="create-game__label">Gra</span>
    <div class="create-game__options">
      <button
        v-for="g in GAME_OPTIONS"
        :key="g.id"
        type="button"
        class="create-game__option"
        :class="{ 'create-game__option--active': g.id === selectedGameId }"
        disabled
      >
        <fa :icon="g.icon" /> {{ g.label }}
      </button>
    </div>
    <p class="create-game__hint">Na razie jedna gra — więcej wkrótce.</p>
  </div>

  <div class="create-game__field">
    <span class="create-game__label">Liczba graczy</span>
    <div class="create-game__options">
      <button
        v-for="n in PLAYER_COUNT_OPTIONS"
        :key="n"
        type="button"
        class="create-game__option"
        :class="{ 'create-game__option--active': n === selectedPlayers }"
        disabled
      >
        {{ n }} <fa icon="user" />
      </button>
    </div>
  </div>

  <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

  <div class="create-game__actions">
    <UiButton
      icon="plus"
      :loading="creating || awaitingHandoff"
      :disabled="creating || awaitingHandoff"
      @click="submit"
    >
      Utwórz
    </UiButton>
  </div>
</div>
</template>
