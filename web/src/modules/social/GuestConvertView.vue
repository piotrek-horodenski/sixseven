<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import router from '@/router'
import { useGateStore } from '@/stores/gate/gate.store'
import { useTokenSocket, type TokenSocket } from '@/composables/useTokenSocket'
import { EMessageType } from '@/controls/controls.model'

/**
 * „Załóż konto, zachowaj wyniki" (Etap 4c). Ekran po meczu gościa. Konwersja
 * idzie przez socket GOŚCIA (token z `hydra_guest_token`, ustawiony w
 * `RoomJoinView`), a NIE przez sesję usera w `gate.store` — `guest:convert`
 * wymaga `socket.guest` po stronie gate, a `guestId` bierze się z TOKENU
 * (anti-hijack), nie z payloadu.
 *
 * Po sukcesie: nowy token usera zapisujemy jako `hydra_token` (przez
 * `gate.authenticate`), kasujemy token gościa, przełączamy socket na sesję
 * usera (`gate.connect`) i wracamy na Home.
 */
const GUEST_TOKEN_KEY = 'hydra_guest_token'

const { t } = useI18n()
const gate = useGateStore()

interface GuestSession {
  token: string
  roomId?: string
  guestId?: string
  gameId?: string
  code?: string
}

function readGuestSession(): GuestSession | null {
  try {
    const raw = localStorage.getItem(GUEST_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GuestSession
    return parsed?.token ? parsed : null
  } catch {
    return null
  }
}

const session = ref<GuestSession | null>(readGuestSession())
const hasSession = computed(() => !!session.value)

const form = ref({ username: '', email: '', password: '' })
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

// Walidacja klienta (szybki feedback) — twarda walidacja i unikaty są SERWEROWE.
const usernameValid = computed(() => form.value.username.trim().length >= 3)
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim()))
const passwordValid = computed(() => form.value.password.length >= 6)
const canSubmit = computed(
  () => hasSession.value && usernameValid.value && emailValid.value && passwordValid.value,
)

let client: TokenSocket | null = null

function ensureClient() {
  if (client || !session.value) return
  client = useTokenSocket(session.value.token)
  client.connect()
  client.on('guest:convert-complete', onComplete)
  client.on('guest:convert-error', onError)
}

function submit() {
  if (!canSubmit.value || loading.value || !session.value) return
  error.value = null
  loading.value = true
  ensureClient()
  client?.call('guest:convert', {
    username: form.value.username.trim(),
    email: form.value.email.trim(),
    password: form.value.password,
  })
}

function onComplete(payload: { userData?: any } = {}) {
  loading.value = false
  success.value = true
  // gate emituje { userData, attached } — wyłuskaj usera (payload NIE jest userem).
  const userData = payload?.userData
  // Zastąp sesję gościa sesją usera: token pod 'hydra_token', przeloguj socket.
  gate.authenticate(userData, userData?.token)
  localStorage.removeItem(GUEST_TOKEN_KEY)
  client?.disconnect()
  client = null
  gate.connect()
  router.push('/')
}

function onError({ message }: { message?: string }) {
  loading.value = false
  error.value = message || t('community.guest.errors.failed')
}

onUnmounted(() => {
  client?.disconnect()
  client = null
})
</script>
<template>
<div class="guest-convert">
  <div class="guest-convert__card">
    <fa icon="user-plus" class="guest-convert__glyph" />
    <h1 class="guest-convert__title">{{ $t('community.guest.title') }}</h1>
    <p class="guest-convert__subtitle">{{ $t('community.guest.subtitle') }}</p>

    <div v-if="!hasSession" class="guest-convert__nosession">
      <UiMessage :type="EMessageType.warning">{{ $t('community.guest.noSession') }}</UiMessage>
      <RouterLink to="/" class="guest-convert__link">{{ $t('community.guest.toHome') }}</RouterLink>
    </div>

    <UiForm v-else @submit.prevent="submit" @keyup.enter="submit">
      <UiInput
        v-model="form.username"
        :placeholder="$t('community.guest.username')"
        autocomplete="username"
      >{{ $t('community.guest.username') }}</UiInput>

      <UiInput
        v-model="form.email"
        type="email"
        :placeholder="$t('community.guest.email')"
        autocomplete="email"
      >{{ $t('community.guest.email') }}</UiInput>

      <UiInput
        v-model="form.password"
        type="password"
        :placeholder="$t('community.guest.password')"
        autocomplete="new-password"
      >{{ $t('community.guest.password') }}</UiInput>

      <template #errors>
        <UiMessage v-if="error" :type="EMessageType.error">{{ error }}</UiMessage>
        <UiMessage v-if="success" :type="EMessageType.success">{{ $t('community.guest.success') }}</UiMessage>
      </template>

      <template #buttons>
        <UiButton
          type="submit"
          icon="user-plus"
          :loading="loading"
          :disabled="!canSubmit"
          @click="submit"
        >{{ $t('community.guest.submit') }}</UiButton>
      </template>
    </UiForm>

    <RouterLink to="/login" class="guest-convert__alt">{{ $t('community.guest.haveAccount') }}</RouterLink>
  </div>
</div>
</template>
