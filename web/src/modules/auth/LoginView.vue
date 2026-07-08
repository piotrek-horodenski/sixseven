<script setup lang="ts">

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'

const gate = useGateStore()
const { loginError, loginLoading, connected } = storeToRefs(gate)

const form = ref({ email: '', password: '' })

const canSubmit = computed(() =>
  form.value.email.trim() !== '' &&
  form.value.password.trim() !== ''
)

function submit() {
  if (!canSubmit.value || loginLoading.value) return
  loginError.value = null
  loginLoading.value = true
  gate.call('login', { ...form.value })
}

</script>
<template>
<div class="auth-page">
  <div class="auth-card">
    <h2 class="auth-card__title">Log in</h2>

    <UiForm @submit.prevent="submit" @keyup.enter="submit">
      <UiInput
        v-model="form.email"
        placeholder="Email or username"
        autocomplete="email"
        class="auth-card__input auth-card__input--login"
      >Email or Username</UiInput>

      <UiInput
        v-model="form.password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
        class="auth-card__input auth-card__input--password"
      >Password</UiInput>

      <template #errors>
        <UiMessage
          v-if="!connected"
          type="warning"
        >Connecting to server...</UiMessage>

        <UiMessage
          v-if="loginError"
          type="error"
        >{{ loginError }}</UiMessage>
      </template>

      <template #buttons>
        <UiButton
          :loading="loginLoading"
          :disabled="!canSubmit"
          @click="submit"
        >Log in</UiButton>
      </template>
    </UiForm>

    <div class="auth-card__footer">
      <span>Don't have an account?</span>
      <RouterLink to="/register">Register</RouterLink>
    </div>
  </div>
</div>
</template>
