<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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

/** `labelKey` = klucz i18n — tłumaczy template ($t), reaguje na zmianę języka. */
type GameOption = { id: string; labelKey: string; icon: string }

const GAME_OPTIONS: GameOption[] = [
  { id: RPS_GAME_ID, labelKey: 'rooms.create.gameRps', icon: 'hand-scissors' },
]
/** Soft-cap tylko do UI (atrybut `max`) — serwer nie blokuje większych wartości. */
const CAPACITY_SOFT_CAP = 8
const DEFAULT_CAPACITY = 2
const DEFAULT_TARGET = 5

const { t } = useI18n()
const gate = useGateStore()
const rooms = useRoomsStore()
const { creating, lastError } = storeToRefs(rooms)

// Widok może być wejściem bezpośrednim (nie tylko z Home) — refcount w store
// (por. `rooms.store.ts`) obsłuży nakładanie się z Home, gdyby oba były aktywne.
onMounted(() => rooms.init())
onUnmounted(() => rooms.cleanup())

const selectedGameId = ref(GAME_OPTIONS[0].id)
/** Trzymane jako string (kontrola `UiInput`), parsowane/walidowane przy submicie. */
const capacityInput = ref(String(DEFAULT_CAPACITY))
const targetInput = ref(String(DEFAULT_TARGET))

const awaitingHandoff = ref(false)

/** Liczba graczy: min 2, bez twardego maksimum. */
function parseCapacity(): number {
  const n = Math.floor(Number(capacityInput.value))
  return Number.isFinite(n) && n >= 2 ? n : DEFAULT_CAPACITY
}

/** Cel punktowy: min 1. */
function parseTarget(): number {
  const n = Math.floor(Number(targetInput.value))
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TARGET
}

function submit() {
  if (creating.value || awaitingHandoff.value) return
  awaitingHandoff.value = true
  const author = gate.user?.profile?.display || gate.user?.username
  // Nazwa trafia na serwer w języku twórcy (widzą ją wszyscy gracze).
  const name = author
    ? t('rooms.create.defaultName', { author })
    : t('rooms.create.defaultNameFallback')
  rooms.createAndPlay(name, 'public', selectedGameId.value, {
    capacity: parseCapacity(),
    target: parseTarget(),
  })
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
  <h2 class="create-game__title">{{ $t('rooms.create.title') }}</h2>

  <div class="create-game__field">
    <span class="create-game__label">{{ $t('rooms.create.gameLabel') }}</span>
    <div class="create-game__options">
      <button
        v-for="g in GAME_OPTIONS"
        :key="g.id"
        type="button"
        class="create-game__option"
        :class="{ 'create-game__option--active': g.id === selectedGameId }"
        disabled
      >
        <fa :icon="g.icon" /> {{ $t(g.labelKey) }}
      </button>
    </div>
    <p class="create-game__hint">{{ $t('rooms.create.onlyOneGameHint') }}</p>
  </div>

  <div class="create-game__field">
    <UiInput
      :modelValue="capacityInput"
      @update:modelValue="(v: string) => (capacityInput = v)"
      type="number"
      min="2"
      :max="CAPACITY_SOFT_CAP"
      inputmode="numeric"
    >
      {{ $t('rooms.create.capacityLabel') }}
    </UiInput>
    <p class="create-game__hint">{{ $t('rooms.create.capacityHint') }}</p>
  </div>

  <div class="create-game__field">
    <UiInput
      :modelValue="targetInput"
      @update:modelValue="(v: string) => (targetInput = v)"
      type="number"
      min="1"
      inputmode="numeric"
    >
      {{ $t('rooms.create.targetLabel') }}
    </UiInput>
  </div>

  <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

  <div class="create-game__actions">
    <UiButton
      icon="plus"
      :loading="creating || awaitingHandoff"
      :disabled="creating || awaitingHandoff"
      @click="submit"
    >
      {{ $t('rooms.create.submit') }}
    </UiButton>
  </div>
</div>
</template>
