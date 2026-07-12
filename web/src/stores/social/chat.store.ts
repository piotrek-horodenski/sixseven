import { ref, shallowRef, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection, type UseCollection } from '@/composables/useCollection'
import { MAX_CHAT_LEN, type ChatMessage, type ChatScope } from './chat.model'

/**
 * Store czatu (Etap 4b) — JEDNO źródło prawdy dla wiadomości bieżącego zakresu
 * (pokój/lobby albo mecz). Osobny plik od `social.store.ts` (A4).
 *
 * Subskrypcja kolekcji `messages` przez `useCollection` z filtrem
 * `{ scope, scopeId }` (serwer AND-uje `{ members: user._id }`, więc filtr może
 * tylko ZAWĘZIĆ — nie da się podejrzeć cudzego czatu). Wysyłka komendą
 * `chat:send`; wynik przychodzi ackiem `chat:send-complete`/`chat:send-error`
 * używanym wyłącznie do UX (rate-limit, błąd długości) — same wiadomości
 * roznosi subskrypcja.
 *
 * Cykl życia liczony referencyjnie (`mounts`) jak w `rooms.store.ts`. Subskrypcja
 * jest tworzona LENIWIE w `init(scope, scopeId)`, bo zakres znamy dopiero przy
 * wejściu do konkretnego pokoju/meczu. Wejście z INNYM zakresem przy aktywnej
 * subskrypcji przełącza czat (zamknij starą, otwórz nową).
 */
export const useChatStore = defineStore('chat', () => {
  const gate = useGateStore()

  const scope = ref<ChatScope | null>(null)
  const scopeId = ref<string | null>(null)
  const mounts = ref(0)
  const started = ref(false)
  const lastError = ref<string | null>(null)
  const rateLimited = ref(false)
  const sending = ref(false)

  // Kolekcja `messages` w shallowRef — instancja powstaje w `init`, gdy znamy
  // zakres. shallowRef (nie ref): ref rozpakowałby wewnętrzny `docs: Ref<T[]>`
  // (UnwrapRef) i `.docs.value` zniknąłby z typu.
  const col = shallowRef<UseCollection<ChatMessage> | null>(null)
  const messages = computed<ChatMessage[]>(() => col.value?.docs.value ?? [])

  /** Wiadomości rosnąco po czasie — najstarsze u góry (klasyczny czat). */
  const sortedMessages = computed(() =>
    [...messages.value].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
  )

  // ---- acki (UX) --------------------------------------------------------

  function onSendComplete() {
    sending.value = false
    rateLimited.value = false
    lastError.value = null
  }
  function onSendError({ message }: { message?: string }) {
    sending.value = false
    // Rate-limit serwerowy: gate zwraca `{ message: 'rate_limited' }`.
    if (message === 'rate_limited') {
      rateLimited.value = true
      lastError.value = t('community.chat.rateLimited')
    } else {
      lastError.value = message || t('community.chat.sendFailed')
    }
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['chat:send-complete', onSendComplete],
    ['chat:send-error', onSendError],
  ]

  function registerAcks() {
    const s = gate.socket
    if (!s) return
    for (const [event, handler] of ackPairs) {
      s.off(event, handler)
      s.on(event, handler)
    }
  }
  function unregisterAcks() {
    const s = gate.socket
    if (!s) return
    for (const [event, handler] of ackPairs) s.off(event, handler)
  }

  // ---- cykl życia (refcount, jeden zakres naraz) ------------------------

  function teardown() {
    col.value?.stop()
    col.value = null
    unregisterAcks()
    gate.offReconnect(registerAcks)
    mounts.value = 0
    started.value = false
    scope.value = null
    scopeId.value = null
    rateLimited.value = false
    lastError.value = null
  }

  function init(nextScope: ChatScope, nextScopeId: string) {
    // Zmiana zakresu przy aktywnej subskrypcji: przełącz na nowy czat.
    if (started.value && (scope.value !== nextScope || scopeId.value !== nextScopeId)) {
      teardown()
    }
    mounts.value += 1
    if (started.value) return
    started.value = true
    scope.value = nextScope
    scopeId.value = nextScopeId
    col.value = useCollection<ChatMessage>('messages', {
      scope: nextScope,
      scopeId: nextScopeId,
    })
    registerAcks()
    gate.onReconnect(registerAcks)
    col.value?.start()
  }

  function cleanup() {
    if (mounts.value > 0) mounts.value -= 1
    if (mounts.value > 0 || !started.value) return
    teardown()
  }

  // ---- komendy ----------------------------------------------------------

  function clearError() {
    lastError.value = null
    rateLimited.value = false
  }

  /**
   * Wysyła wiadomość w bieżącym zakresie. Zwraca `true`, gdy komenda poszła do
   * gate (walidacja klienta przeszła). Trim + limit długości to tylko szybki
   * feedback — obowiązuje limit SERWEROWY.
   */
  function send(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed || !scope.value || !scopeId.value) return false
    if (trimmed.length > MAX_CHAT_LEN) {
      lastError.value = t('community.chat.tooLong', { max: MAX_CHAT_LEN })
      return false
    }
    lastError.value = null
    rateLimited.value = false
    sending.value = true
    gate.call('chat:send', { scope: scope.value, scopeId: scopeId.value, text: trimmed })
    return true
  }

  return {
    // stan
    scope,
    scopeId,
    mounts,
    started,
    lastError,
    rateLimited,
    sending,
    // gettery
    messages,
    sortedMessages,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    send,
  }
})
