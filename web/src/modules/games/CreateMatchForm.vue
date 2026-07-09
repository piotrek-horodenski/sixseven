<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGamesStore } from '@/stores/games/games.store'
import { EMessageType } from '@/controls/controls.model'

const router = useRouter()
const games = useGamesStore()
const { creating, lastCreatedMatchId, lastError } = storeToRefs(games)

const opponent = ref('')
const target = ref(2)
const awaitingNav = ref(false)

const opponentValid = () => opponent.value.trim().length > 0

function create() {
  if (!opponentValid() || creating.value) return
  awaitingNav.value = true
  games.createRpsMatch(opponent.value.trim(), Math.max(1, Math.min(9, Number(target.value) || 2)))
}

// Po acku create-match-complete: przejdź prosto do ekranu meczu.
watch(lastCreatedMatchId, (id) => {
  if (id && awaitingNav.value) {
    awaitingNav.value = false
    opponent.value = ''
    router.push(`/play/${id}`)
  }
})

watch(opponent, () => {
  if (lastError.value) games.clearError()
})
</script>
<template>
<form class="create-match" @submit.prevent="create">
  <h2 class="create-match__title">Nowy mecz RPS</h2>

  <div class="create-match__field">
    <UiInput
      v-model="opponent"
      placeholder="userId zalogowanego gracza"
      autocomplete="off"
    >
      ID przeciwnika
    </UiInput>
    <p class="create-match__hint">
      2c bez matchmakingu — podaj identyfikator drugiego gracza. Mecz pojawi się
      u obu graczy na liście.
    </p>
  </div>

  <div class="create-match__field create-match__field--inline">
    <label class="create-match__label">Grasz do (zwycięstw)</label>
    <UiNumber v-model="target" :min="1" :max="9" integer />
  </div>

  <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

  <div class="create-match__actions">
    <UiButton
      type="submit"
      icon="plus"
      :loading="creating"
      :disabled="!opponentValid() || creating"
    >
      Utwórz mecz
    </UiButton>
  </div>
</form>
</template>
