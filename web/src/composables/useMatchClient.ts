import { ref, computed, type Ref } from 'vue'
import { t } from '@/i18n'
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
  /** Ack porzucenia meczu (`games:abandon-complete`) — sygnał „można wychodzić". */
  const abandonAcked = ref(false)

  let client: TokenSocket | null = null

  const match = computed<Match | null>(
    () => matches.value.find((m) => m._id === matchId.value) ?? matches.value[0] ?? null,
  )

  /** Najświeższy widok gracza (najwyższa runda). */
  const latestView = computed<MatchView | undefined>(
    () => [...views.value].sort((a, b) => b.round - a.round)[0],
  )

  /** Pełny roster meczu (gracze + goście), w kolejności players → guestIds. */
  const players = computed<string[]>(() => {
    const m = match.value
    if (!m) return []
    return [...(m.players ?? []), ...(m.guestIds ?? [])]
  })

  /** Roster bez mnie — pozostali uczestnicy (dla N graczy). */
  const opponents = computed<string[]>(() => {
    if (!playerId.value) return []
    return players.value.filter((id) => id !== playerId.value)
  })

  /** Przeciwnik: pierwszy z `opponents`. Zachowane dla zgodności (2-osobowe UI/logi). */
  const opponentId = computed<string | null>(() => opponents.value[0] ?? null)

  function onRejected() {
    rejected.value = true
  }
  function onError({ message }: { message?: string }) {
    error.value = message || t('games.errors.operationFailed')
  }
  function onAbandonComplete() {
    abandonAcked.value = true
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
        throw new Error(data.message || t('games.errors.joinFailed'))
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
      error.value = e?.message || t('games.errors.joinFailed')
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
    client.on('games:abandon-complete', onAbandonComplete)
    client.on('games:abandon-error', onError)
  }

  function submitMove(move: RpsMove) {
    rejected.value = false
    client?.call('games:submit-move', { matchId: matchId.value, move })
  }

  function revealDone() {
    client?.call('games:reveal-done', { matchId: matchId.value })
  }

  /**
   * Porzucenie meczu (fix „wyjście z gry" + 4e). Idzie NA SOCKECIE TOKENU MECZU
   * — matchId i playerId gate bierze z tokenu, payload jest PUSTY (kontrakt §3).
   * Ranked → walkower z pełną karą ELO; casual → noop po stronie games.
   */
  function abandon() {
    abandonAcked.value = false
    client?.call('games:abandon', {})
  }

  // Zgłoszenie gotowości w lobby (Etap 3 pkt 5). W przepływie pokoi mecz powstaje
  // w fazie lobby; gate dokłada playerId z tożsamości tokenu i woła
  // `engine.playerReady`. Planning (i timer) startuje dopiero, gdy KAŻDY
  // uczestnik rosteru zgłosi gotowość — jedno kliknięcie już NIE odpala rundy
  // u obu graczy.
  function startMatch() {
    client?.call('games:start', { matchId: matchId.value })
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
    abandonAcked,
    // pochodne
    match,
    latestView,
    players,
    opponents,
    opponentId,
    // akcje
    start,
    startMatch,
    submitMove,
    revealDone,
    abandon,
    cleanup,
  }
}
