<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { useChatStore } from '@/stores/social/chat.store'
import { MAX_CHAT_LEN, type ChatScope } from '@/stores/social/chat.model'
import { EMessageType } from '@/controls/controls.model'

/**
 * Panel czatu w slocie `aside` (lobby gry / trasa gry). Lista wiadomości +
 * pole wysyłki. Obsługuje limit długości i rate-limit (komunikaty).
 *
 * SEKRET (Etap 4d): w meczach RANKINGOWYCH czat renderuje PLATFORMA (ten
 * komponent), a NIE bundle gry — bundle nie ma dostępu do sesji ani do
 * kanału `messages`. Tu tylko notatka; sam bundle powstaje w Etapie 4d.
 *
 * Zakres (`scope`/`scopeId`) przychodzi z propsów; jeśli integrator nie może
 * ich podać przez slot `aside`, komponent czyta fallback z query
 * (`?scope=&scopeId=`). Bez zakresu panel pokazuje stan pusty (nie subskrybuje).
 */
const props = defineProps<{
  scope?: ChatScope
  scopeId?: string | null
}>()

const route = useRoute()
const gate = useGateStore()
const chat = useChatStore()
const { sortedMessages, lastError, rateLimited, sending } = storeToRefs(chat)

const effScope = computed<ChatScope>(
  () => props.scope ?? ((route.query.scope as ChatScope) || 'room'),
)
const effScopeId = computed<string | null>(
  () => props.scopeId ?? ((route.query.scopeId as string) || null),
)

const meId = computed<string | null>(() => gate.user?._id ?? null)

const draft = ref('')
const remaining = computed(() => MAX_CHAT_LEN - draft.value.trim().length)
const tooLong = computed(() => draft.value.trim().length > MAX_CHAT_LEN)
const canSend = computed(
  () => draft.value.trim().length > 0 && !tooLong.value && !!effScopeId.value,
)

const listRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function formatTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function submit() {
  if (!canSend.value || sending.value) return
  const ok = chat.send(draft.value)
  if (ok) draft.value = ''
}

// Wejście / zmiana zakresu → (re)subskrypcja przez store (refcount).
function bind(scope: ChatScope, scopeId: string | null) {
  if (scopeId) chat.init(scope, scopeId)
}

onMounted(() => bind(effScope.value, effScopeId.value))

watch(effScopeId, (next, prev) => {
  if (next === prev) return
  // Store sam zamyka poprzedni zakres w init(); przy zniknięciu zakresu sprzątamy.
  if (next) chat.init(effScope.value, next)
  else chat.cleanup()
})

// Autoscroll na nową wiadomość (najnowsze u dołu).
watch(
  () => sortedMessages.value.length,
  () => nextTick(scrollToBottom),
)

onUnmounted(() => {
  if (effScopeId.value) chat.cleanup()
})
</script>
<template>
<section class="chat-panel">
  <header class="chat-panel__header">
    <fa icon="comments" class="chat-panel__icon" />
    <h3 class="chat-panel__title">{{ $t('community.chat.title') }}</h3>
  </header>

  <div v-if="!effScopeId" class="chat-panel__empty">
    {{ $t('community.chat.noScope') }}
  </div>

  <template v-else>
    <ol ref="listRef" class="chat-panel__list">
      <li v-if="!sortedMessages.length" class="chat-panel__empty">
        {{ $t('community.chat.empty') }}
      </li>
      <li
        v-for="m in sortedMessages"
        :key="m._id"
        class="chat-msg"
        :class="{ 'chat-msg--me': m.authorId === meId }"
      >
        <div class="chat-msg__meta">
          <span class="chat-msg__author">{{ m.authorNick }}</span>
          <time class="chat-msg__time" :datetime="new Date(m.ts).toISOString()">{{ formatTime(m.ts) }}</time>
        </div>
        <p class="chat-msg__text">{{ m.text }}</p>
      </li>
    </ol>

    <UiForm class="chat-panel__form" @submit.prevent="submit">
      <UiInput
        v-model="draft"
        :placeholder="$t('community.chat.placeholder')"
        :maxlength="MAX_CHAT_LEN + 1"
        autocomplete="off"
        class="chat-panel__input"
        @keyup.enter="submit"
      />

      <template #errors>
        <UiMessage v-if="rateLimited" :type="EMessageType.warning">
          {{ $t('community.chat.rateLimited') }}
        </UiMessage>
        <UiMessage v-else-if="tooLong" :type="EMessageType.warning">
          {{ $t('community.chat.tooLong', { max: MAX_CHAT_LEN }) }}
        </UiMessage>
        <UiMessage v-else-if="lastError" :type="EMessageType.error">
          {{ lastError }}
        </UiMessage>
      </template>

      <template #buttons>
        <span class="chat-panel__counter" :class="{ 'chat-panel__counter--over': remaining < 0 }">
          {{ remaining }}
        </span>
        <UiButton
          type="submit"
          icon="paper-plane"
          :loading="sending"
          :disabled="!canSend"
          @click="submit"
        >{{ $t('community.chat.send') }}</UiButton>
      </template>
    </UiForm>
  </template>
</section>
</template>
