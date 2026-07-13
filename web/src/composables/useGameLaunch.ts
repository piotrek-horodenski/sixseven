import { ref, type Ref } from 'vue'
import { useCatalogStore } from '@/stores/games/catalog.store'
import type { CatalogGame } from '@/stores/games/catalog.model'

/**
 * useGameLaunch — wspólne wejście do gry po `games:handoff-complete` (4d).
 *
 * Builtin (RPS): dotychczasowa ścieżka `/game/rps?handoff=…&return=/`.
 * Gra zewnętrzna: pełny redirect na `uiUrl?handoff=CODE&return=<origin>` —
 * przy PIERWSZYM wejściu w daną grę pokazujemy modal ostrzegawczy („gra NIGDY
 * nie prosi o hasło platformy"), a potwierdzenie zapamiętujemy w localStorage
 * per gameId (`hydra_ext_game_ack_<gameId>`).
 *
 * `navigate` jest wstrzykiwalne dla testów (domyślnie pełne przeładowanie —
 * apka gry/UI dewelopera to osobny dokument, nie route SPA).
 */

export interface HandoffPayload {
  code: string
  gameId: string
}

/** Oczekujące wejście do gry zewnętrznej — czeka na potwierdzenie modala. */
export interface PendingExternalLaunch {
  game: CatalogGame
  url: string
}

const ACK_KEY_PREFIX = 'hydra_ext_game_ack_'

/** Klucz localStorage jednorazowego ostrzeżenia dla danej gry. */
export function externalAckKey(gameId: string): string {
  return `${ACK_KEY_PREFIX}${gameId}`
}

export interface UseGameLaunch {
  pendingExternal: Ref<PendingExternalLaunch | null>
  launch: (handoff: HandoffPayload) => void
  confirmExternal: () => void
  cancelExternal: () => void
}

export function useGameLaunch(
  navigate: (url: string) => void = (url) => {
    window.location.href = url
  },
): UseGameLaunch {
  const catalog = useCatalogStore()

  const pendingExternal = ref<PendingExternalLaunch | null>(null)

  function buildBuiltinUrl(handoff: HandoffPayload): string {
    return `/game/rps?handoff=${encodeURIComponent(handoff.code)}&return=/`
  }

  function buildExternalUrl(game: CatalogGame, handoff: HandoffPayload): string {
    const base = game.uiUrl as string
    const sep = base.includes('?') ? '&' : '?'
    // `return` = origin platformy — gra zewnętrzna wraca linkiem, nie ścieżką.
    return `${base}${sep}handoff=${encodeURIComponent(handoff.code)}&return=${encodeURIComponent(window.location.origin)}`
  }

  /** Wejście do gry: builtin od razu, zewnętrzna przez jednorazowy modal. */
  function launch(handoff: HandoffPayload) {
    const game = catalog.gameById(handoff.gameId)
    if (game && !game.builtin && game.uiUrl) {
      const url = buildExternalUrl(game, handoff)
      if (!localStorage.getItem(externalAckKey(game._id))) {
        pendingExternal.value = { game, url }
        return
      }
      navigate(url)
      return
    }
    // Builtin albo gra spoza katalogu (np. katalog jeszcze się nie załadował) —
    // bezpieczny default: dotychczasowa ścieżka wbudowana.
    navigate(buildBuiltinUrl(handoff))
  }

  /** Potwierdzenie modala: zapamiętaj per gra i wykonaj redirect. */
  function confirmExternal() {
    const pending = pendingExternal.value
    if (!pending) return
    localStorage.setItem(externalAckKey(pending.game._id), String(Date.now()))
    pendingExternal.value = null
    navigate(pending.url)
  }

  function cancelExternal() {
    pendingExternal.value = null
  }

  return { pendingExternal, launch, confirmExternal, cancelExternal }
}
