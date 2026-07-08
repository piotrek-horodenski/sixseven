<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'

const gate = useGateStore()
const { registerError, registerSuccess, connected } = storeToRefs(gate)

const form = ref({ username: '', email: '', password: '' })
const loading = ref(false)

const canSubmit = computed(() =>
  form.value.username.trim() !== '' &&
  form.value.email.trim() !== '' &&
  form.value.password.trim() !== ''
)

function submit() {
  if (!canSubmit.value || loading.value) return
  registerError.value = null
  registerSuccess.value = false
  loading.value = true
  gate.call('register', { ...form.value })
}

watch(registerError, (val) => {
  if (val) loading.value = false
})

watch(registerSuccess, (val) => {
  if (val) loading.value = false
})

</script>
<template>
<div class="auth-page">
  <div class="auth-card">
    <h2 class="auth-card__title">Create account</h2>

    <UiForm @submit.prevent="submit" @keyup.enter="submit">
      <UiInput
        v-model="form.username"
        placeholder="Username"
        autocomplete="username"
        class="auth-card__input auth-card__input--username"
      >Username</UiInput>

      <UiInput
        v-model="form.email"
        type="email"
        placeholder="Email"
        autocomplete="email"
        class="auth-card__input auth-card__input--email"
      >Email</UiInput>

      <UiInput
        v-model="form.password"
        type="password"
        placeholder="Password"
        autocomplete="new-password"
        class="auth-card__input auth-card__input--password"
      >Password</UiInput>

      <template #errors>
        <UiMessage
          v-if="!connected"
          type="warning"
        >Connecting to server...</UiMessage>

        <UiMessage
          v-if="registerError"
          type="error"
        >{{ registerError }}</UiMessage>

        <UiMessage
          v-if="registerSuccess"
          type="success"
        >Account created! You can now <RouterLink to="/login">log in</RouterLink>.</UiMessage>
      </template>

      <template #buttons>
        <UiButton
          :loading="loading"
          :disabled="!canSubmit"
          @click="submit"
        >Register</UiButton>
      </template>
    </UiForm>

    <div class="auth-card__footer">
      <span>Already have an account?</span>
      <RouterLink to="/login">Log in</RouterLink>
    </div>
  </div>
</div>
</template>
