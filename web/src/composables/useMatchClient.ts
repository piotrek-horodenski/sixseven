import { ref, computed, type Ref } from 'vue'
import { useTokenSocket, type TokenSocket } from './useTokenSocket'
import type { Match, MatchView, RpsMove } from '@/stores/games/games.model'

/**
 * useMatchClient — stan meczu dla aplikacji gry (`/game/rps`), całkowicie
 * niezależny od `gate.store` usera.
 *
 * Wejście: kod handoffu z `?handoff=`. Wymieniamy go REST-em
 * (`POST {VITE_GATE_HTTP_URL}/auth/match-token { code }`) na token meczu, po
 * czym łączymy WŁASNY socket (`useTokenSocket`) tym tokenem i subskrybujemy
 * `matches` ({ _id }) oraz `match_views` ({ playerId, matchId }). Ruchy idą
 * `games:submit-move` / `games:reveal-done` — gate scope’uje je do tokenu meczu.
 *
 * `fetchFn` jest wstrzykiwalne dla testów (domyślnie globalny `fetch`).
 */

export interface MatchTokenResponse {
  token: string
  matchId: string
  playerId: string
  gameId: string
  expiresAt?: number
}

export type MatchClientStatus = 'idle' | 'exchanging' | 'ready' | 'error'

const httpBase = import.meta.env.VITE_GATE_HTTP_URL || 'https://localhost:4114'

export function useMatchClient(fetchFn: typeof fetch = fetch) {
  const status = ref<MatchClientStatus>('idle')
  const error = ref<string | null>(null)

  const matchId = ref<string | null>(null)
  const playerId = ref<string | null>(null)
  const gameId = ref<string | null>(null)

  const matches = ref<Match[]>([]) as Ref<Match[]>
  const views = ref<MatchView[]>([]) as Ref<MatchView[]>
  const rejected = ref(false)

  let client: TokenSocket | null = null

  const match = computed<Match | null>(
    () => matches.value.find((m) => m._id === matchId.value) ?? matches.value[0] ?? null,
  )

  /** Najświeższy widok gracza (najwyższa runda). */
  const latestView = computed<MatchView | undefined>(
    () => [...views.value].sort((a, b) => b.round - a.round)[0],
  )

  /** Przeciwnik: dowolny uczestnik (user lub gość) różny od mnie. */
  const opponentId = computed<string | null>(() => {
    const m = match.value
    if (!m || !playerId.value) return null
    const all = [...(m.players ?? []), ...(m.guestIds ?? [])]
    return all.find((id) => id !== playerId.value) ?? null
  })

  function onRejected() {
    rejected.value = true
  }
  function onError({ message }: { message?: string }) {
    error.value = message || 'Operacja nie powiodła się'
  }

  /**
   * Wymienia kod handoffu na token meczu i łączy socket. Zwraca `true`, gdy
   * wymiana się powiodła (token pozyskany) — bez czekania na połączenie socketu.
   */
  async function start(handoffCode: string): Promise<boolean> {
    status.value = 'exchanging'
    error.value = null
    try {
      const res = await fetchFn(`${httpBase}/auth/match-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: handoffCode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Nie udało się dołączyć do meczu')
      }
      const data = (await res.json()) as MatchTokenResponse
      matchId.value = data.matchId
      playerId.value = data.playerId
      gameId.value = data.gameId
      connect(data.token)
      status.value = 'ready'
      return true
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message || 'Nie udało się dołączyć do meczu'
      return false
    }
  }

  function connect(token: string) {
    client = useTokenSocket(token)
    client.subscribe<Match>('matches', { _id: matchId.value }, matches)
    client.subscribe<MatchView>(
      'match_views',
      { playerId: playerId.value, matchId: matchId.value },
      views,
    )
    // connect() najpierw tworzy instancję socketu; dopiero potem można podpiąć
    // listenery acków (on() bez żywego socketu byłby no-opem).
    client.connect()
    client.on('games:submit-move-rejected', onRejected)
    client.on('games:submit-move-error', onError)
    client.on('games:reveal-done-error', onError)
  }

  function submitMove(move: RpsMove) {
    rejected.value = false
    client?.call('games:submit-move', { matchId: matchId.value, move })
  }

  function revealDone() {
    client?.call('games:reveal-done', { matchId: matchId.value })
  }

  function cleanup() {
    client?.disconnect()
    client = null
  }

  return {
    // stan
    status,
    error,
    matchId,
    playerId,
    gameId,
    matches,
    views,
    rejected,
    // pochodne
    match,
    latestView,
    opponentId,
    // akcje
    start,
    submitMove,
    revealDone,
    cleanup,
  }
}
