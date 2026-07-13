import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '@/i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection } from '@/composables/useCollection'
import type { CatalogGame, RegisterGameForm } from './catalog.model'

/**
 * Store katalogu gier (Etap 4d) — jedno źródło prawdy: subskrypcja publicznej
 * kolekcji `games` (builtin + published; polityka gate dokłada własne gry
 * dewelopera i całość dla `manage-games`). Ten sam store obsługuje trzy
 * powierzchnie:
 *  - katalog (Home / CreateGameView): `playableGames`, `rankedGames`,
 *  - widok dewelopera (`/dev`): `myGames` + komendy `dev:*`,
 *  - moderację admina (`/admin/games`): `externalGames` + komendy `admin:games-*`.
 *
 * Komendy idą socketem usera do gate; wynik przychodzi ackiem
 * (`*-complete` / `*-error`), a stan katalogu aktualizuje osobno subskrypcja.
 * `hmacSecret` przychodzi JEDEN raz w `dev:register-game-complete` — trzymamy
 * go wyłącznie w pamięci (`lastSecret`) do momentu zamknięcia okna (clearSecret).
 *
 * Cykl życia liczony referencyjnie (`mounts`) — wzorzec 1:1 z `rooms.store.ts`
 * (katalog subskrybuje kilka widoków naraz: Home, /new, /dev, /admin/games).
 */
export const useCatalogStore = defineStore('catalog', () => {
  const gate = useGateStore()

  const gamesCol = useCollection<CatalogGame>('games')
  const games = gamesCol.docs

  const mounts = ref(0)
  const started = ref(false)
  const lastError = ref<string | null>(null)

  // --- dev (4d) ---
  const enrolling = ref(false)
  /** Rola nadana w tej sesji socketu (token nie odświeża uprawnień do reconnectu). */
  const enrolled = ref(false)
  const registering = ref(false)
  /** Sekret HMAC pokazywany JEDEN raz po rejestracji — czyścić po zamknięciu okna. */
  const lastSecret = ref<{ gameId: string; hmacSecret: string } | null>(null)
  const updating = ref(false)
  const lastUpdatedGameId = ref<string | null>(null)

  // --- admin (4d) ---
  const moderatingId = ref<string | null>(null)

  const currentUserId = computed<string | null>(() => gate.user?._id ?? null)

  // ---- gettery -----------------------------------------------------------

  /** Gry grywalne w katalogu: builtin + opublikowane zewnętrzne (builtin pierwsze). */
  const playableGames = computed(() =>
    [...games.value]
      .filter((g) => g.builtin || g.status === 'published')
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)),
  )

  /** Gry z kolejką szybkiego meczu (ranked — tylko builtin wg ADR). */
  const rankedGames = computed(() => playableGames.value.filter((g) => g.rankedEligible))

  /** Moje gry (deweloper) — polityka gate i tak oddaje tylko published + własne. */
  const myGames = computed(() =>
    [...games.value]
      .filter((g) => !!currentUserId.value && g.devAccountId === currentUserId.value)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  )

  /** Gry zewnętrzne (moderacja admina) — bez builtin, `registered` na górze. */
  const externalGames = computed(() =>
    [...games.value]
      .filter((g) => !g.builtin)
      .sort(
        (a, b) =>
          Number(b.status === 'registered') - Number(a.status === 'registered') ||
          (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      ),
  )

  function gameById(id: string | null | undefined): CatalogGame | undefined {
    if (!id) return undefined
    return games.value.find((g) => g._id === id)
  }

  /** Gra jest zewnętrzna, gdy nie jest builtin i ma bazę UI poza platformą. */
  function isExternal(id: string | null | undefined): boolean {
    const g = gameById(id)
    return !!g && !g.builtin && !!g.uiUrl
  }

  // ---- acki (UX) ----------------------------------------------------------

  function onEnrollComplete() {
    enrolling.value = false
    enrolled.value = true
    lastError.value = null
  }
  function onEnrollError({ message }: { message?: string }) {
    enrolling.value = false
    lastError.value = message || t('dev.errors.enrollFailed')
  }
  function onRegisterComplete({ gameId, hmacSecret }: { gameId: string; hmacSecret: string }) {
    registering.value = false
    lastError.value = null
    lastSecret.value = { gameId, hmacSecret }
  }
  function onRegisterError({ message }: { message?: string }) {
    registering.value = false
    lastError.value = message || t('dev.errors.registerFailed')
  }
  function onUpdateComplete({ gameId }: { gameId: string }) {
    updating.value = false
    lastError.value = null
    lastUpdatedGameId.value = gameId
  }
  function onUpdateError({ message }: { message?: string }) {
    updating.value = false
    lastError.value = message || t('dev.errors.updateFailed')
  }
  function onModerationComplete() {
    moderatingId.value = null
    lastError.value = null
  }
  function onModerationError({ message }: { message?: string }) {
    moderatingId.value = null
    lastError.value = message || t('games.errors.operationFailed')
  }

  const ackPairs: [string, (...a: any[]) => void][] = [
    ['dev:enroll-complete', onEnrollComplete],
    ['dev:enroll-error', onEnrollError],
    ['dev:register-game-complete', onRegisterComplete],
    ['dev:register-game-error', onRegisterError],
    ['dev:update-game-complete', onUpdateComplete],
    ['dev:update-game-error', onUpdateError],
    ['admin:games-approve-complete', onModerationComplete],
    ['admin:games-approve-error', onModerationError],
    ['admin:games-unpublish-complete', onModerationComplete],
    ['admin:games-unpublish-error', onModerationError],
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

  // ---- cykl życia (refcount) ----------------------------------------------

  function init() {
    mounts.value += 1
    if (started.value) return
    started.value = true
    registerAcks()
    gate.onReconnect(registerAcks)
    gamesCol.start()
  }

  function cleanup() {
    if (mounts.value > 0) mounts.value -= 1
    if (mounts.value > 0 || !started.value) return
    gamesCol.stop()
    unregisterAcks()
    gate.offReconnect(registerAcks)
    lastError.value = null
    lastSecret.value = null
    started.value = false
  }

  // ---- komendy -------------------------------------------------------------

  function clearError() {
    lastError.value = null
  }

  /** Czyści sekret HMAC z pamięci (po zamknięciu okna „pokazany raz"). */
  function clearSecret() {
    lastSecret.value = null
  }

  /** Self-service: nadaje zalogowanemu userowi rolę `developer` (idempotentne). */
  function enroll() {
    lastError.value = null
    enrolling.value = true
    gate.call('dev:enroll', {})
  }

  /** Rejestruje grę zewnętrzną. `devAccountId` dokłada gate z tokenu — NIE my. */
  function registerGame(form: RegisterGameForm) {
    lastError.value = null
    lastSecret.value = null
    registering.value = true
    gate.call('dev:register-game', {
      gameId: form.gameId,
      name: form.name,
      serviceUrl: form.serviceUrl,
      uiUrl: form.uiUrl,
      manifest: form.manifest,
    })
  }

  /** Edycja gry — KAŻDA zmiana cofa status do `registered` (ponowny approve). */
  function updateGame(
    gameId: string,
    patch: { serviceUrl?: string; uiUrl?: string; manifest?: RegisterGameForm['manifest'] },
  ) {
    lastError.value = null
    lastUpdatedGameId.value = null
    updating.value = true
    gate.call('dev:update-game', { gameId, ...patch })
  }

  /** Approve gry (admin, `manage-games`) → status published. */
  function approveGame(gameId: string) {
    lastError.value = null
    moderatingId.value = gameId
    gate.call('admin:games-approve', { gameId })
  }

  /** Wycofanie gry (admin) → status unpublished. */
  function unpublishGame(gameId: string) {
    lastError.value = null
    moderatingId.value = gameId
    gate.call('admin:games-unpublish', { gameId })
  }

  return {
    // stan
    games,
    mounts,
    started,
    lastError,
    enrolling,
    enrolled,
    registering,
    lastSecret,
    updating,
    lastUpdatedGameId,
    moderatingId,
    currentUserId,
    // gettery
    playableGames,
    rankedGames,
    myGames,
    externalGames,
    gameById,
    isExternal,
    // cykl życia
    init,
    cleanup,
    // komendy
    clearError,
    clearSecret,
    enroll,
    registerGame,
    updateGame,
    approveGame,
    unpublishGame,
  }
})
