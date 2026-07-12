<script setup lang="ts">

import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { useGateStore } from '@/stores/gate/gate.store'

const gate = useGateStore()
const saveState = reactive({ saving: false, saved: false })
const display = ref('')
const error = ref<string | null>(null)

let savedTimer: ReturnType<typeof setTimeout> | null = null

function load() {
  display.value = gate.user?.profile?.display || ''
}

load()

function save() {
  error.value = null
  saveState.saving = true
  saveState.saved = false
  gate.call('profile:update', { display: display.value })
}

function onComplete({ display: newDisplay }: { display: string }) {
  saveState.saving = false
  saveState.saved = true
  if (gate.user) {
    gate.user.profile = { ...gate.user.profile, display: newDisplay }
  }
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { saveState.saved = false }, 2000)
}

function onStopped({ message }: { message: string }) {
  saveState.saving = false
  error.value = message
}

onMounted(() => {
  gate.socket?.on('profile:update-complete', onComplete)
  gate.socket?.on('profile:update-stopped', onStopped)
})

onUnmounted(() => {
  gate.socket?.off('profile:update-complete', onComplete)
  gate.socket?.off('profile:update-stopped', onStopped)
  if (savedTimer) clearTimeout(savedTimer)
})

</script>
<template>
<div class="admin-panel">
  <div class="admin-panel__header">
    <h3 style="flex: 1; text-align: center">{{ $t('profile.editProfile') }}</h3>
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ $t('common.save') }}</UiButton>
  </div>

  <div class="admin-panel__body">
    <div class="admin-panel__section">
      <UiInput
        :modelValue="gate.user?.username"
        disabled
      >{{ $t('profile.username') }}</UiInput>
      <UiInput
        :modelValue="gate.user?.email"
        disabled
      >{{ $t('profile.email') }}</UiInput>
      <UiInput
        v-model="display"
        :placeholder="$t('profile.displayName')"
      >{{ $t('profile.displayName') }}</UiInput>
    </div>

    <p v-if="error" class="admin-confirm-text">{{ error }}</p>
  </div>

  <div class="admin-panel__footer">
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ $t('common.save') }}</UiButton>
  </div>
</div>
</template>
