<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { RPS_GAME_ID } from '@/stores/rooms/rooms.model'
import { EMessageType } from '@/controls/controls.model'

const router = useRouter()
const rooms = useRoomsStore()
const { creating, lastCreatedRoomId, lastError } = storeToRefs(rooms)

const name = ref('')
const isPublic = ref(true)
const awaitingNav = ref(false)

const nameValid = () => name.value.trim().length > 0

function create() {
  if (!nameValid() || creating.value) return
  awaitingNav.value = true
  rooms.createRoom(name.value.trim(), isPublic.value ? 'public' : 'private', RPS_GAME_ID)
}

// Po acku create-complete: wejdź prosto do pokoju.
watch(lastCreatedRoomId, (id) => {
  if (id && awaitingNav.value) {
    awaitingNav.value = false
    name.value = ''
    router.push(`/rooms/${id}`)
  }
})

watch(name, () => {
  if (lastError.value) rooms.clearError()
})
</script>
<template>
<form class="create-room" @submit.prevent="create">
  <h2 class="create-room__title">Nowy pokój</h2>

  <div class="create-room__field">
    <UiInput
      v-model="name"
      placeholder="np. Wieczorne RPS"
      autocomplete="off"
    >
      Nazwa pokoju
    </UiInput>
  </div>

  <div class="create-room__field create-room__field--inline">
    <label class="create-room__label">
      {{ isPublic ? 'Publiczny' : 'Prywatny' }}
      <span class="create-room__hint-inline">
        {{ isPublic ? 'widoczny w hubie' : 'tylko z linku' }}
      </span>
    </label>
    <UiSwitch v-model="isPublic" />
  </div>

  <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

  <div class="create-room__actions">
    <UiButton
      type="submit"
      icon="plus"
      :loading="creating"
      :disabled="!nameValid() || creating"
    >
      Utwórz pokój
    </UiButton>
  </div>
</form>
</template>
