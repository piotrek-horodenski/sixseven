import { ref } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'

/**
 * Store preferencji per (user, gra) POZA meczem — ekran Preferencje, sekcja
 * „Gry" (Etap 3B pkt 5 kontraktu fali 1A, `docs/ETAP3B_GAMES_CONTRACT.md`).
 *
 * `playerId` gate bierze zawsze z `socket.user._id` (JWT) — payload go nie
 * zawiera. Wzorzec acków 1:1 jak `stores/rooms/rooms.store.ts` (bez
 * subskrypcji kolekcji, bo prefs nie są kolekcją — proste get/set + ack).
 */
export const useGamePrefsStore = defineStore('game-prefs', () => {
  const gate = useGateStore()

  /** Ostatnio wczytane/zapisane prefs, per gameId. Brak wpisu = jeszcze nie wczytane. */
  const prefsByGame = ref<Record<string, Record<string, unknown>>>({})
  const loadingGames = ref<Record<string, boolean>>({})
  const savingGames = ref<Record<string, boolean>>({})
  const lastError = ref<string | null>(null)

  const started = ref(false)

  function prefsFor(gameId: string): Record<string, unknown> {
    return prefsByGame.value[gameId] ?? {}
  }

  function isLoading(gameId: string): boolean {
    return !!loadingGames.value[gameId]
  }

  function isSaving(gameId: string): boolean {
    return !!savingGames.value[gameId]
  }

  // ---- acki ---------------------------------------------------------------

  function onGetComplete({ gameId, prefs }: { gameId: string; prefs: Record<string, unknown> }) {
    prefsByGame.value = { ...prefsByGame.value, [gameId]: prefs || {} }
    loadingGames.value = { ...loadingGames.value, [gameId]: false }
  }
  function onGetError({ message }: { message?: string }) {
    lastError.value = message || t('preferences.errors.load')
    // Nie znamy gameId przy błędzie ogólnym — czyścimy wszystkie flagi ładowania,
    // żeby UI nie zostało w stanie „loading" na zawsze.
    loadingGames.value = {}
  }
  function onSetComplete({ gameId }: { gameId: string }) {
    savingGames.value = { ...savingGames.value, [gameId]: false }
  }
  function onSetError({ message }: { message?: string }) {
    lastError.value = message || t('preferences.errors.save')
    savingGames.value = {}
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['games:get-prefs-complete', onGetComplete],
    ['games:get-prefs-error', onGetError],
    ['games:set-prefs-complete', onSetComplete],
    ['games:set-prefs-error', onSetError],
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
    for (const [event, handler] of ackPairs) {
      s.off(event, handler)
    }
  }

  // ---- cykl życia -----------------------------------------------------------

  function init() {
    if (started.value) return
    started.value = true
    registerAcks()
    gate.onReconnect(registerAcks)
  }

  function cleanup() {
    if (!started.value) return
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    started.value = false
  }

  // ---- komendy --------------------------------------------------------------

  function loadPrefs(gameId: string) {
    lastError.value = null
    loadingGames.value = { ...loadingGames.value, [gameId]: true }
    gate.call('games:get-prefs', { gameId })
  }

  function savePrefs(gameId: string, prefs: Record<string, unknown>) {
    lastError.value = null
    savingGames.value = { ...savingGames.value, [gameId]: true }
    // Optymistycznie od razu odkładamy do lokalnego stanu — ekran nie "mruga"
    // do defaultu w trakcie zapisu; ack `set-prefs-complete` tylko gasi spinner.
    prefsByGame.value = { ...prefsByGame.value, [gameId]: { ...prefsFor(gameId), ...prefs } }
    gate.call('games:set-prefs', { gameId, prefs })
  }

  return {
    // stan
    prefsByGame,
    lastError,
    started,
    // gettery
    prefsFor,
    isLoading,
    isSaving,
    // cykl życia
    init,
    cleanup,
    // komendy
    loadPrefs,
    savePrefs,
  }
})
