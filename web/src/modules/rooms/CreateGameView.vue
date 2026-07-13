<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { useCatalogStore } from '@/stores/games/catalog.store'
import { useGameLaunch } from '@/composables/useGameLaunch'
import { RPS_GAME_ID } from '@/stores/rooms/rooms.model'
import { EMessageType } from '@/controls/controls.model'
import ExternalGameWarning from '@/modules/games/ExternalGameWarning.vue'

/**
 * Ekran tworzenia gry (`/new`, Etap 3b; Etap 4d — katalog data-driven).
 * Lista gier pochodzi z subskrypcji kolekcji `games` (catalog.store):
 * builtin + opublikowane zewnętrzne. Gra zewnętrzna dostaje etykietę
 * „UI poza platformą".
 *
 * Po „Utwórz": `rooms.createAndPlay(...)` tworzy pokój+mecz i sam poprosi o
 * handoff, gdy tylko przyjdzie `matchId` (patrz `rooms.store`). Wejście do gry
 * robi `useGameLaunch`: builtin = pełne przeładowanie do `/game/rps`,
 * zewnętrzna = redirect na `uiUrl?handoff=…&return=…` (z jednorazowym modalem
 * ostrzegawczym przy pierwszym wejściu w daną grę).
 */

/** Soft-cap tylko do UI (atrybut `max`) — serwer nie blokuje większych wartości. */
const CAPACITY_SOFT_CAP = 8
const DEFAULT_CAPACITY = 2
const DEFAULT_TARGET = 5

const { t } = useI18n()
const gate = useGateStore()
const rooms = useRoomsStore()
const catalog = useCatalogStore()
const launcher = useGameLaunch()
const { creating, lastError } = storeToRefs(rooms)

// Widok może być wejściem bezpośrednim (nie tylko z Home) — refcount w store
// (por. `rooms.store.ts`) obsłuży nakładanie się z Home, gdyby oba były aktywne.
onMounted(() => {
  rooms.init()
  catalog.init()
})
onUnmounted(() => {
  rooms.cleanup()
  catalog.cleanup()
})

/** Katalog do wyboru: builtin + published (builtin pierwsze). */
const gameOptions = computed(() => catalog.playableGames)

const selectedGameId = ref(RPS_GAME_ID)
// Katalog może dopłynąć po mount — jeśli wybrana gra zniknęła/nie istnieje,
// wróć do pierwszej dostępnej.
watch(gameOptions, (opts) => {
  if (opts.length && !opts.some((g) => g._id === selectedGameId.value)) {
    selectedGameId.value = opts[0]._id
  }
})

const selectedGame = computed(() => catalog.gameById(selectedGameId.value))

/** Ikona opcji: builtin RPS jak dotąd, zewnętrzna = glob. */
function optionIcon(gameId: string): string {
  const g = catalog.gameById(gameId)
  return g?.builtin ? 'hand-scissors' : 'globe'
}

/** Trzymane jako string (kontrola `UiInput`), parsowane/walidowane przy submicie. */
const capacityInput = ref(String(DEFAULT_CAPACITY))
const targetInput = ref(String(DEFAULT_TARGET))

const awaitingHandoff = ref(false)

function select(gameId: string) {
  if (gameId === selectedGameId.value) return
  selectedGameId.value = gameId
  // Podpowiedzi z manifestu wybranej gry (min graczy / domyślny cel).
  const m = catalog.gameById(gameId)?.manifest
  if (m) {
    capacityInput.value = String(Math.max(DEFAULT_CAPACITY, m.minPlayers))
    targetInput.value = String(m.defaultTarget ?? DEFAULT_TARGET)
  }
}

/** Liczba graczy: min 2 (lub minPlayers manifestu), bez twardego maksimum. */
function parseCapacity(): number {
  const min = Math.max(2, selectedGame.value?.manifest?.minPlayers ?? 2)
  const n = Math.floor(Number(capacityInput.value))
  return Number.isFinite(n) && n >= min ? n : min
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

// Po `games:handoff-complete`: wejście do gry przez useGameLaunch (builtin →
// `/game/rps`, zewnętrzna → uiUrl + jednorazowy modal ostrzegawczy).
watch(
  () => rooms.lastHandoff,
  (h) => {
    if (h && awaitingHandoff.value) {
      awaitingHandoff.value = false
      launcher.launch(h)
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
        v-for="g in gameOptions"
        :key="g._id"
        type="button"
        class="create-game__option"
        :class="{ 'create-game__option--active': g._id === selectedGameId }"
        @click="select(g._id)"
      >
        <fa :icon="optionIcon(g._id)" /> {{ g.name }}
        <span v-if="!g.builtin && g.uiUrl" class="create-game__ext-badge">
          {{ $t('games.catalog.externalUi') }}
        </span>
      </button>
    </div>
    <p v-if="gameOptions.length <= 1" class="create-game__hint">
      {{ $t('rooms.create.onlyOneGameHint') }}
    </p>
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

  <!-- Jednorazowe ostrzeżenie przed grą zewnętrzną (4d) -->
  <ExternalGameWarning
    :pending="launcher.pendingExternal.value"
    @confirm="launcher.confirmExternal()"
    @cancel="launcher.cancelExternal()"
  />
</div>
</template>
