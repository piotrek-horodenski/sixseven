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
    <h2 class="auth-card__title">{{ $t('auth.createAccount') }}</h2>

    <UiForm @submit.prevent="submit" @keyup.enter="submit">
      <UiInput
        v-model="form.username"
        :placeholder="$t('auth.username')"
        autocomplete="username"
        class="auth-card__input auth-card__input--username"
      >{{ $t('auth.username') }}</UiInput>

      <UiInput
        v-model="form.email"
        type="email"
        :placeholder="$t('auth.email')"
        autocomplete="email"
        class="auth-card__input auth-card__input--email"
      >{{ $t('auth.email') }}</UiInput>

      <UiInput
        v-model="form.password"
        type="password"
        :placeholder="$t('auth.password')"
        autocomplete="new-password"
        class="auth-card__input auth-card__input--password"
      >{{ $t('auth.password') }}</UiInput>

      <template #errors>
        <UiMessage
          v-if="!connected"
          type="warning"
        >{{ $t('auth.connectingToServer') }}</UiMessage>

        <UiMessage
          v-if="registerError"
          type="error"
        >{{ registerError }}</UiMessage>

        <UiMessage
          v-if="registerSuccess"
          type="success"
        >{{ $t('auth.accountCreated') }} <RouterLink to="/login">{{ $t('auth.accountCreatedLogIn') }}</RouterLink>.</UiMessage>
      </template>

      <template #buttons>
        <UiButton
          :loading="loading"
          :disabled="!canSubmit"
          @click="submit"
        >{{ $t('auth.register') }}</UiButton>
      </template>
    </UiForm>

    <div class="auth-card__footer">
      <span>{{ $t('auth.alreadyHaveAccount') }}</span>
      <RouterLink to="/login">{{ $t('auth.logIn') }}</RouterLink>
    </div>
  </div>
</div>
</template>
