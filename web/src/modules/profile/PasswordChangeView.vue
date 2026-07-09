<script setup lang="ts">

import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'
import { useGateStore } from '@/stores/gate/gate.store'

const gate = useGateStore()
const saveState = reactive({ saving: false, saved: false })
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref<string | null>(null)

let savedTimer: ReturnType<typeof setTimeout> | null = null

const mismatch = computed(() => {
  return newPassword.value && confirmPassword.value && newPassword.value !== confirmPassword.value
})

function save() {
  error.value = null

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = 'All fields are required'
    return
  }

  if (mismatch.value) {
    error.value = 'New passwords do not match'
    return
  }

  if (newPassword.value.length < 6) {
    error.value = 'New password must be at least 6 characters'
    return
  }

  saveState.saving = true
  saveState.saved = false
  gate.call('profile:change-password', {
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
  })
}

function onComplete() {
  saveState.saving = false
  saveState.saved = true
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { saveState.saved = false }, 2000)
}

function onStopped({ message }: { message: string }) {
  saveState.saving = false
  error.value = message
}

onMounted(() => {
  gate.socket?.on('profile:change-password-complete', onComplete)
  gate.socket?.on('profile:change-password-stopped', onStopped)
})

onUnmounted(() => {
  gate.socket?.off('profile:change-password-complete', onComplete)
  gate.socket?.off('profile:change-password-stopped', onStopped)
  if (savedTimer) clearTimeout(savedTimer)
})

</script>
<template>
<div class="admin-panel">
  <div class="admin-panel__header">
    <h3 style="flex: 1; text-align: center">Change Password</h3>
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >Change Password</UiButton>
  </div>

  <div class="admin-panel__body">
    <div class="admin-panel__section">
      <UiInput
        v-model="currentPassword"
        type="password"
        placeholder="Current password"
      >Current Password</UiInput>
      <UiInput
        v-model="newPassword"
        type="password"
        placeholder="New password"
      >New Password</UiInput>
      <UiInput
        v-model="confirmPassword"
        type="password"
        placeholder="Confirm new password"
      >Confirm New Password</UiInput>
    </div>

    <p v-if="mismatch" class="admin-confirm-text">Passwords do not match</p>
    <p v-if="error" class="admin-confirm-text">{{ error }}</p>
  </div>

  <div class="admin-panel__footer">
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >Change Password</UiButton>
  </div>
</div>
</template>
