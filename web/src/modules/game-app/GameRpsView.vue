<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatchClient } from '@/composables/useMatchClient'
import { RPS_MOVES, REVEAL_MS, playerLabel, isBot } from '@/modules/games/rps.consts'
import { exitVariantFor, roundOutcomeFor, type ExitVariant } from './game-app.helpers'
import type { RpsMove, RpsRevealedMove } from '@/stores/games/games.model'
import RpsHand from '@/modules/games/RpsHand.vue'
import RpsIcon from '@/modules/games/RpsIcon.vue'
import ChatAsidePanel from '@/modules/social/ChatAsidePanel.vue'
import { useGateStore } from '@/stores/gate/gate.store'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { EPopupSize } from '@/controls/controls.model'

/**
 * Aplikacja gry RPS (`/game/rps`) — standalone, poza AppLayout, BEZ `gate.store`
 * usera. Tożsamość bierze się z tokenu meczu wymienionego z `?handoff=`.
 * Prezentacja reużywa `RpsHand`, `rps.consts` i klas `.rps-*` z modułu 2c.
 *
 * Etap 3C: ekran obsługuje N graczy (2..N) — roster/tablica wyników/siatka
 * rąk w reveal iterują po `client.players` zamiast zakładać jednego przeciwnika.
 */

const route = useRoute()
const client = useMatchClient()
const { t } = useI18n()

const returnUrl = computed(() => {
  const r = route.query.return
  // Bezpieczny powrót: TYLKO ścieżka lokalna (jeden `/`, bez `//`, `\` ani
  // schematu). Blokuje open-redirect i nawigacyjny kanał eksfiltracji (S3) —
  // złośliwy link pokoju nie przekieruje gracza na obcy origin.
  if (typeof r === 'string' && /^\/(?![/\\])/.test(r)) return r
  return '/'
})

const match = client.match
const meId = computed(() => client.playerId.value)
/** Denormalizowane nazwy graczy z meczu (id→nick) — do etykiet w grze. */
const nicks = computed<Record<string, string>>(() => (match.value?.nicks ?? {}) as Record<string, string>)

// Link zaproszenia gościa (`/r/CODE`) — widoczny przy NIEPEŁNYM rosterze.
const shareUrl = computed<string | null>(() => {
  const code = match.value?.roomCode
  if (!code) return null
  return `${window.location.origin}/r/${code}`
})
const shareCopied = ref(false)
async function copyShare() {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareCopied.value = true
    window.setTimeout(() => (shareCopied.value = false), 1500)
  } catch { /* kopiowanie niedostępne — użytkownik może zaznaczyć ręcznie */ }
}
/** Pełny roster meczu (gracze + goście), włącznie ze mną. */
const roster = client.players
/** Roster bez mnie — pozostali uczestnicy. */
const others = client.opponents

// Czat meczu (4b) — OVERLAY tylko dla zalogowanego gracza. gate.store używane
// WYŁĄCZNIE do tego panelu (nie do tożsamości gry — ta idzie z tokenu meczu).
// Gość (playerId w guestIds, brak sesji gate) czatu nie dostaje (MVP).
const gate = useGateStore()
const chatOpen = ref(false)
const chatMatchId = computed<string | null>(() => match.value?._id ?? null)
const canChat = computed<boolean>(() =>
  gate.isAuthenticated &&
  !!chatMatchId.value &&
  !!meId.value &&
  (match.value?.players ?? []).includes(meId.value as string),
)

// Stan pokoi (fix „wyjście z gry"): potrzebny WYŁĄCZNIE do rozwiązania roomId
// (rooms:close hosta w lobby) — tylko dla zalogowanego usera (gość nie ma
// sesji gate, więc i tak nie jest hostem pokoju z tej ścieżki).
const rooms = useRoomsStore()
onMounted(() => {
  if (gate.isAuthenticated) rooms.init()
})
onUnmounted(() => {
  if (gate.isAuthenticated) rooms.cleanup()
})

onMounted(() => {
  const handoff = route.query.handoff
  if (typeof handoff === 'string' && handoff) {
    client.start(handoff)
  } else {
    client.status.value = 'error'
    client.error.value = t('games.errors.missingHandoff')
  }
})

// ---- zegar / odliczanie ------------------------------------------------
const now = ref(Date.now())
let clock: number | undefined
onMounted(() => {
  clock = window.setInterval(() => (now.value = Date.now()), 200)
})

const planningTotal = ref(0)
const remainingMs = computed(() => {
  const m = match.value
  if (!m || m.phase !== 'planning' || !m.deadline) return 0
  return Math.max(0, m.deadline - now.value)
})
const remainingSec = computed(() => Math.ceil(remainingMs.value / 1000))

const RING_CIRC = 2 * Math.PI * 42
const ringOffset = computed(() => {
  const frac =
    planningTotal.value > 0 ? Math.min(1, Math.max(0, remainingMs.value / planningTotal.value)) : 0
  return RING_CIRC * (1 - frac)
})
const timeLow = computed(() => remainingMs.value > 0 && remainingMs.value <= 3000)

// ---- ruch gracza -------------------------------------------------------
const selectedMove = ref<RpsMove | null>(null)
const iAmReady = computed(() => (meId.value ? !!match.value?.ready?.[meId.value] : false))
const rejected = computed(() => client.rejected.value)

// Gotowość pozostałych graczy w fazie planning (dla N: licznik zamiast
// pojedynczego "przeciwnika jeszcze wybiera").
const othersReadyCount = computed(
  () => others.value.filter((id) => !!match.value?.ready?.[id]).length,
)
const allOthersReady = computed(
  () => others.value.length > 0 && othersReadyCount.value === others.value.length,
)

function pick(move: RpsMove) {
  if (iAmReady.value) return
  selectedMove.value = move
  client.submitMove(move)
}

// Brama gotowości lobby (Etap 3 pkt 5): mecz powstaje w fazie lobby
// (rooms:start tylko go tworzy); Planning (i timer) startuje dopiero, gdy
// KAŻDY uczestnik rosteru zgłosi gotowość — jedno kliknięcie już NIE odpala
// rundy u wszystkich graczy.
const iAmLobbyReady = computed(() => (meId.value ? !!match.value?.lobbyReady?.[meId.value] : false))
const starting = ref(false)
function startMatch() {
  starting.value = true
  client.startMatch()
}

// ---- lobby: czekanie na graczy / komplet / auto-start (Etap 3B/3C) -----
// Mecz powstaje OD RAZU przy zakładaniu gry (twórca w players, wolne sloty).
// Sloty wolne <=> jeszcze nie ma kompletu rosteru wg `capacity` (backend pkt 1).
const capacity = computed(() => match.value?.capacity ?? 2)
const rosterCount = computed(() => roster.value.length)
const lobbyFull = computed(() => rosterCount.value >= capacity.value)
const emptySlots = computed(() => Math.max(0, capacity.value - rosterCount.value))

// Odliczanie auto-startu: backend stawia `deadline` przy PIERWSZYM lobbyReady
// (planningPhaseMs). Reużywamy istniejącego zegara `now`.
const lobbyRemainingMs = computed(() => {
  const m = match.value
  if (!m || m.phase !== 'lobby' || !m.deadline) return 0
  return Math.max(0, m.deadline - now.value)
})
const lobbyRemainingSec = computed(() => Math.ceil(lobbyRemainingMs.value / 1000))

// Zabezpieczenie klienckie: jeśli licznik dobiegł zera a scheduler jeszcze nie
// wystartował meczu (np. opóźnienie ticku), wołamy `games:start` ponownie —
// `engine.playerReady`/`start` jest idempotentny po stronie backendu, więc to
// tylko „popchnięcie", nie duplikuje efektów.
let autoStartFiredForDeadline: number | null = null
watch(lobbyRemainingMs, (ms) => {
  const m = match.value
  if (!m || m.phase !== 'lobby' || !m.deadline || !meId.value) return
  if (ms <= 0 && autoStartFiredForDeadline !== m.deadline) {
    autoStartFiredForDeadline = m.deadline
    client.startMatch()
  }
})

watch(
  () => match.value?.round,
  () => {
    selectedMove.value = null
  },
)

// ---- reveal --------------------------------------------------------------
const view = computed(() => client.latestView.value?.view ?? null)
const roundWinner = computed(() => view.value?.roundWinner ?? null)

function pickFor(pid: string): RpsRevealedMove | null {
  return view.value?.moves.find((m) => m.playerId === pid) ?? null
}
function roundPointsFor(pid: string): number {
  return view.value?.roundPoints?.[pid] ?? 0
}
// FIX (backlog): etykieta rundy liczona z `roundWinner` eventu — unikalny lider
// = win, remis na szczycie (roundWinner === null) = draw, reszta = lose. NIE ze
// znaku punktów rundy (suma parowa bywa ujemna także u „niewygranych").
function outcomeFor(pid: string): 'win' | 'lose' | 'draw' {
  return roundOutcomeFor(view.value?.roundWinner, pid)
}
function formatPoints(pts: number): string {
  if (pts > 0) return `+${pts}`
  return String(pts)
}
const roundOutcome = computed<'win' | 'lose' | 'draw'>(() =>
  meId.value ? outcomeFor(meId.value) : 'draw',
)

const revealed = ref(false)
let revealFlip: number | undefined
let revealAdvance: number | undefined
const emittedReveal = new Set<number>()

function clearRevealTimers() {
  if (revealFlip) clearTimeout(revealFlip)
  if (revealAdvance) clearTimeout(revealAdvance)
  revealFlip = undefined
  revealAdvance = undefined
}

watch(
  () => match.value?.phase,
  (phase) => {
    clearRevealTimers()
    revealed.value = false
    const m = match.value
    if (phase === 'planning' && m?.deadline) {
      planningTotal.value = Math.max(1, m.deadline - Date.now())
    }
    if (phase === 'revealing' && m) {
      revealFlip = window.setTimeout(() => (revealed.value = true), 650)
      const round = m.round
      revealAdvance = window.setTimeout(() => {
        if (!emittedReveal.has(round)) {
          emittedReveal.add(round)
          client.revealDone()
        }
      }, REVEAL_MS)
    }
  },
)

// ---- tablica wyników / wynik meczu ---------------------------------------
const target = computed(() => Number(match.value?.options?.target) || 5)
const scoresMap = computed<Record<string, number>>(() => match.value?.score ?? {})
function scoreOf(pid: string): number {
  return scoresMap.value[pid] ?? 0
}
const maxScore = computed(() => {
  if (!roster.value.length) return 0
  return Math.max(...roster.value.map((pid) => scoreOf(pid)))
})
/** Lider(zy) tablicy wyników — może być kilku przy remisie na szczycie. */
const leaders = computed(() => roster.value.filter((pid) => scoreOf(pid) === maxScore.value))
const isTopTie = computed(() => leaders.value.length > 1)
const winnerId = computed(() => (isTopTie.value ? null : leaders.value[0] ?? null))
const matchOutcome = computed<'win' | 'lose' | 'draw'>(() => {
  // Walkower (4e): zwycięzcę wskazuje mecz, nie tablica punktów.
  const w = match.value?.walkover
  if (w) return w.winnerId === meId.value ? 'win' : 'lose'
  if (isTopTie.value) return 'draw'
  return winnerId.value === meId.value ? 'win' : 'lose'
})
/** Roster posortowany malejąco po wyniku — do końcowej tablicy. */
const sortedRoster = computed(() =>
  [...roster.value].sort((a, b) => scoreOf(b) - scoreOf(a)),
)

const cancelReason = computed(() => {
  switch (match.value?.endReason) {
    case 'cancelled_lobby':
      return t('games.cancelled.lobby')
    case 'cancelled_paused':
      return t('games.cancelled.paused')
    case 'walkover':
      return t('games.cancelled.walkover')
    default:
      return t('games.cancelled.default')
  }
})

function goBack() {
  window.location.href = returnUrl.value
}

// ---- trwały przycisk „Wyjdź" (FIX z backlogu, kontrakt §4 „Fixy" pkt 1) ----
// Trzy warianty: host w lobby → rooms:close; casual w toku → sama nawigacja
// (defaultMove gra dalej); ranked w toku → games:abandon (walkower, socket
// tokenu meczu). Finished/cancelled/error mają własne `goBack` — bez przycisku.

/** Pokój tego meczu (do rooms:close hosta) — z subskrypcji rooms usera. */
const myRoom = computed(() => {
  const m = match.value
  if (!m) return undefined
  return (
    rooms.rooms.find((r) => r.matchId === m._id) ??
    (m.roomCode ? rooms.rooms.find((r) => r.code === m.roomCode) : undefined)
  )
})
const iAmRoomHost = computed(() => rooms.isHost(myRoom.value))

const exitVariant = computed<ExitVariant | null>(() =>
  exitVariantFor(match.value?.phase, !!match.value?.ranked, iAmRoomHost.value),
)
const showExit = computed(
  () => client.status.value === 'ready' && !!match.value && exitVariant.value !== null,
)

const exitOpen = ref(false)
/** Wysłano komendę wyjścia — czekamy na ack (fallback: timer poniżej). */
const exiting = ref(false)
let exitFallback: number | undefined
/** Fallback nawigacji, gdyby ack nie doszedł (utrata socketu itp.). */
const EXIT_FALLBACK_MS = 1500

/** Baza klucza i18n modala wyjścia (`games.exit.<baza>Title/Body/Confirm`). */
const exitKeyBase = computed(() => {
  switch (exitVariant.value) {
    case 'lobby-host':
      return 'lobbyHost'
    case 'lobby-guest':
      return 'lobbyGuest'
    case 'ranked':
      return 'ranked'
    default:
      return 'casual'
  }
})

function requestExit() {
  exitOpen.value = true
}

function cancelExit() {
  exitOpen.value = false
}

function confirmExit() {
  const variant = exitVariant.value
  exitOpen.value = false
  if (!variant) return
  // Warianty bez komendy: nawigacja natychmiast.
  if (variant === 'casual' || variant === 'lobby-guest') {
    goBack()
    return
  }
  exiting.value = true
  if (variant === 'lobby-host') {
    const roomId = myRoom.value?._id
    // Preferuj rooms:close (gra znika wszystkim); brak pokoju w stanie →
    // dopuszczalny fallback games:abandon (w lobby to noop) + nawigacja.
    if (roomId) rooms.close(roomId)
    else client.abandon()
  } else {
    // ranked: walkower — komenda idzie socketem TOKENU MECZU.
    client.abandon()
  }
  exitFallback = window.setTimeout(goBack, EXIT_FALLBACK_MS)
}

// Ack zamknięcia pokoju / porzucenia meczu → nawigacja bez czekania na timer.
watch(
  () => rooms.lastClosedRoomId,
  (id) => {
    if (exiting.value && id) goBack()
  },
)
watch(client.abandonAcked, (acked) => {
  if (exiting.value && acked) goBack()
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  if (exitFallback) clearTimeout(exitFallback)
  clearRevealTimers()
  client.cleanup()
})
</script>
<template>
<div class="game-app">
  <div class="game-app__frame">
    <!-- Wymiana handoffu / błąd -->
    <div v-if="client.status.value === 'exchanging' || client.status.value === 'idle'" class="rps-state">
      <fa icon="circle-notch" class="rotate rps-state__glyph" />
      <p class="rps-state__text">{{ $t('games.connecting') }}</p>
    </div>

    <div v-else-if="client.status.value === 'error'" class="rps-state rps-state--muted">
      <fa icon="times-circle" class="rps-state__glyph" />
      <h2 class="rps-state__title">{{ $t('games.errors.joinFailedTitle') }}</h2>
      <p class="rps-state__text">{{ client.error.value }}</p>
      <button class="rps-finished__list" type="button" @click="goBack">{{ $t('games.back') }}</button>
    </div>

    <template v-else>
      <!-- Trwały afordans wyjścia (fix z backlogu) + badge meczu rankingowego (4e) -->
      <div class="game-app__topbar">
        <button
          v-if="showExit"
          type="button"
          class="game-app__exit"
          :disabled="exiting"
          @click="requestExit"
        >
          <fa icon="arrow-right-from-bracket" />
          {{ exiting ? $t('games.exit.leaving') : $t('games.exit.button') }}
        </button>
        <span v-if="match?.ranked" class="game-app__ranked">
          <fa icon="ranking-star" /> {{ $t('games.ranked.badge') }}
        </span>
      </div>

      <header class="game-app__header">
        <div v-if="match && lobbyFull && match.phase !== 'lobby' && match.phase !== 'finished'" class="match-screen__scoreboard match-screen__scoreboard--grid">
          <div
            v-for="pid in roster"
            :key="pid"
            class="score-chip"
            :class="{ 'score-chip--me': pid === meId, 'score-chip--lead': scoreOf(pid) === maxScore }"
          >
            <span class="score-chip__name">
              {{ playerLabel(pid, meId, nicks) }}
              <fa v-if="isBot(pid)" icon="robot" class="bot-badge" :title="$t('games.bot.tooltip')" />
            </span>
            <span class="score-chip__val">{{ scoreOf(pid) }}</span>
          </div>
          <span class="match-screen__target">{{ $t('games.scoreTarget', { target }) }}</span>
        </div>
      </header>

      <div v-if="match" class="rps-board">
        <!-- LOBBY -->
        <div v-if="match.phase === 'lobby'" class="rps-state rps-lobby">
          <!-- czekanie na graczy: sloty wolne wg capacity -->
          <template v-if="!lobbyFull">
            <fa icon="circle-notch" class="rotate rps-state__glyph" />
            <h2 class="rps-state__title">{{ $t('games.lobby.waitingTitle', { count: rosterCount, capacity }) }}</h2>
            <p class="rps-state__text">
              {{ $t('games.lobby.waitingBody', { target }) }}
            </p>
            <ul class="rps-roster">
              <li v-for="pid in roster" :key="pid" class="rps-roster__item">
                <span class="rps-dot rps-dot--on" />
                {{ playerLabel(pid, meId, nicks) }}
                <fa v-if="isBot(pid)" icon="robot" class="bot-badge" :title="$t('games.bot.tooltip')" />
              </li>
              <li v-for="n in emptySlots" :key="`empty-${n}`" class="rps-roster__item rps-roster__item--empty">
                <span class="rps-dot" />
                {{ $t('games.lobby.emptySlot') }}
              </li>
            </ul>

            <!-- Link zaproszenia gościa (kod pokoju) — niepełny roster. -->
            <div v-if="shareUrl" class="rps-share">
              <p class="rps-share__label">{{ $t('games.lobby.inviteLabel') }}</p>
              <div class="rps-share__row">
                <input class="rps-share__input" :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
                <button type="button" class="rps-share__copy" @click="copyShare">
                  <fa :icon="shareCopied ? 'check' : 'copy'" />
                  {{ shareCopied ? $t('games.lobby.inviteCopied') : $t('games.lobby.inviteCopy') }}
                </button>
              </div>
            </div>
          </template>

          <!-- komplet graczy -->
          <template v-else>
            <fa icon="hand-scissors" class="rps-state__glyph" />
            <h2 class="rps-state__title">{{ $t('games.lobby.readyTitle') }}</h2>
            <p class="rps-state__text">{{ $t('games.lobby.readyBody', { count: rosterCount, target }) }}</p>
            <UiButton v-if="!iAmLobbyReady" icon="play" :loading="starting" @click="startMatch">{{ $t('games.lobby.start') }}</UiButton>
            <p v-else class="rps-planning__waiting">
              <fa icon="circle-notch" class="rotate" />
              {{ $t('games.lobby.waitingForOthers') }}
            </p>
            <ul class="rps-roster">
              <li v-for="pid in roster" :key="pid" class="rps-roster__item">
                <span class="rps-dot" :class="{ 'rps-dot--on': !!match.lobbyReady?.[pid] }" />
                {{ playerLabel(pid, meId, nicks) }}
                <fa v-if="isBot(pid)" icon="robot" class="bot-badge" :title="$t('games.bot.tooltip')" />
                <span v-if="match.lobbyReady?.[pid]" class="rps-roster__ready">{{ $t('games.lobby.ready') }}</span>
              </li>
            </ul>

            <!-- odliczanie auto-startu: ktoś już kliknął Rozpocznij (deadline ustawiony) -->
            <p v-if="match.deadline" class="rps-lobby__countdown">
              <fa icon="hourglass-half" />
              {{ $t('games.lobby.autoStart', { seconds: lobbyRemainingSec }) }}
            </p>
          </template>
        </div>

        <!-- PLANNING -->
        <div v-else-if="match.phase === 'planning'" class="rps-planning">
          <div class="rps-planning__timer" :class="{ 'rps-planning__timer--low': timeLow }">
            <svg viewBox="0 0 100 100" class="rps-ring">
              <circle class="rps-ring__track" cx="50" cy="50" r="42" />
              <circle
                class="rps-ring__fill"
                cx="50"
                cy="50"
                r="42"
                :stroke-dasharray="RING_CIRC"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <span class="rps-ring__value">{{ remainingSec }}</span>
          </div>

          <p class="rps-planning__prompt">{{ $t('games.planning.prompt', { round: match.round }) }}</p>

          <div class="rps-moves" :class="{ 'rps-moves--locked': iAmReady }">
            <button
              v-for="mv in RPS_MOVES"
              :key="mv.move"
              type="button"
              class="rps-move"
              :class="{ 'rps-move--selected': selectedMove === mv.move }"
              :disabled="iAmReady"
              @click="pick(mv.move)"
            >
              <RpsIcon :move="mv.move" class="rps-move__icon" />
              <span class="rps-move__label">{{ $t(mv.labelKey) }}</span>
            </button>
          </div>

          <p v-if="rejected" class="rps-planning__rejected">
            <fa icon="exclamation-circle" /> {{ $t('games.planning.rejected') }}
          </p>
          <p v-else-if="iAmReady" class="rps-planning__waiting">
            <fa icon="circle-notch" class="rotate" />
            {{ $t('games.planning.waitingForOthers', { ready: othersReadyCount, total: others.length }) }}
          </p>
          <p v-else class="rps-planning__opponent">
            <span class="rps-dot" :class="{ 'rps-dot--on': allOthersReady }" />
            {{ allOthersReady ? $t('games.planning.othersReady') : $t('games.planning.othersProgress', { ready: othersReadyCount, total: others.length }) }}
          </p>
        </div>

        <!-- RESOLVING -->
        <div v-else-if="match.phase === 'resolving'" class="rps-state">
          <fa icon="circle-notch" class="rotate rps-state__glyph" />
          <p class="rps-state__text">{{ $t('games.resolving') }}</p>
        </div>

        <!-- REVEALING -->
        <div v-else-if="match.phase === 'revealing'" class="rps-reveal">
          <div class="rps-reveal__grid">
            <div
              v-for="pid in roster"
              :key="pid"
              class="rps-reveal__cell"
              :class="{ 'rps-reveal__cell--winner': revealed && roundWinner === pid }"
            >
              <RpsHand
                :move="(pickFor(pid)?.move as RpsMove) ?? null"
                :revealed="revealed"
                :outcome="revealed ? outcomeFor(pid) : null"
                :defaulted="pickFor(pid)?.defaulted"
                :label="playerLabel(pid, meId, nicks)"
              />
              <span
                v-if="revealed"
                class="rps-reveal__points"
                :class="`rps-reveal__points--${outcomeFor(pid)}`"
              >
                {{ formatPoints(roundPointsFor(pid)) }}
              </span>
            </div>
          </div>

          <Transition name="rps-verdict">
            <p
              v-if="revealed"
              class="rps-reveal__verdict"
              :class="`rps-reveal__verdict--${roundOutcome}`"
            >
              {{ $t(`games.reveal.${roundOutcome}`) }}
            </p>
          </Transition>
        </div>

        <!-- FINISHED -->
        <div v-else-if="match.phase === 'finished'" class="rps-state rps-finished">
          <fa
            :icon="matchOutcome === 'win' ? 'trophy' : matchOutcome === 'draw' ? 'handshake' : 'flag'"
            class="rps-state__glyph"
            :class="`rps-finished__glyph--${matchOutcome}`"
          />
          <h2 class="rps-state__title">
            {{ $t(`games.finished.${matchOutcome}`) }}
          </h2>
          <!-- Walkower (4e): mecz zakończony poddaniem/rozłączeniem -->
          <p v-if="match.walkover" class="rps-state__text">{{ $t('games.cancelled.walkover') }}</p>
          <ul class="rps-finished__board">
            <li
              v-for="pid in sortedRoster"
              :key="pid"
              class="rps-finished__row"
              :class="{ 'rps-finished__row--me': pid === meId, 'rps-finished__row--winner': leaders.includes(pid) }"
            >
              <span class="rps-finished__name">
                {{ playerLabel(pid, meId, nicks) }}
                <fa v-if="isBot(pid)" icon="robot" class="bot-badge" :title="$t('games.bot.tooltip')" />
              </span>
              <span class="rps-finished__val">{{ scoreOf(pid) }}</span>
            </li>
          </ul>
          <p class="match-screen__target">{{ $t('games.scoreTarget', { target }) }}</p>
          <div class="rps-finished__actions">
            <UiButton icon="caret-left" @click="goBack">{{ $t('games.back') }}</UiButton>
            <!-- Konwersja gościa (4c): tylko dla gracza-gościa. Pełna nawigacja
                 (apka gry jest standalone); token gościa jest w hydra_guest_token. -->
            <a
              v-if="meId && match?.guestIds?.includes(meId)"
              href="/guest/convert"
              class="rps-finished__list"
            >{{ $t('community.guest.cta') }}</a>
          </div>
        </div>

        <!-- PAUSED -->
        <div v-else-if="match.phase === 'paused'" class="rps-state rps-state--warn">
          <fa icon="circle-notch" class="rotate rps-state__glyph" />
          <h2 class="rps-state__title">{{ $t('games.paused.title') }}</h2>
          <p class="rps-state__text">{{ $t('games.paused.body') }}</p>
        </div>

        <!-- CANCELLED -->
        <div v-else-if="match.phase === 'cancelled'" class="rps-state rps-state--muted">
          <fa icon="times-circle" class="rps-state__glyph" />
          <h2 class="rps-state__title">{{ $t('games.cancelled.title') }}</h2>
          <p class="rps-state__text">{{ cancelReason }}</p>
          <button class="rps-finished__list" type="button" @click="goBack">{{ $t('games.back') }}</button>
        </div>
      </div>

      <div v-else class="rps-state">
        <fa icon="circle-notch" class="rotate rps-state__glyph" />
        <p class="rps-state__text">{{ $t('games.loadingMatch') }}</p>
      </div>
    </template>
  </div>

  <!-- Czat meczu (4b): zwijany overlay dla zalogowanego gracza. -->
  <div v-if="canChat" class="game-app__chat" :class="{ 'game-app__chat--open': chatOpen }">
    <button
      type="button"
      class="game-app__chat-toggle"
      :aria-expanded="chatOpen"
      :title="$t('community.chat.title')"
      @click="chatOpen = !chatOpen"
    >
      <fa :icon="chatOpen ? 'times' : 'comments'" />
    </button>
    <div v-if="chatOpen" class="game-app__chat-drawer">
      <ChatAsidePanel scope="match" :scope-id="chatMatchId" />
    </div>
  </div>

  <!-- Modal wyjścia (3 warianty: host lobby / casual / ranked-walkower) -->
  <UiPopup :show="exitOpen" :size="EPopupSize.thin" :outsideClose="true" @update:show="cancelExit">
    <template #title>{{ $t(`games.exit.${exitKeyBase}Title`) }}</template>
    <div class="game-exit">
      <p class="game-exit__body">{{ $t(`games.exit.${exitKeyBase}Body`) }}</p>
      <div class="game-exit__actions">
        <UiButton class="accent" @click="cancelExit">{{ $t('games.exit.stay') }}</UiButton>
        <UiButton icon="arrow-right-from-bracket" @click="confirmExit">
          {{ $t(`games.exit.${exitKeyBase}Confirm`) }}
        </UiButton>
      </div>
    </div>
  </UiPopup>
</div>
</template>
