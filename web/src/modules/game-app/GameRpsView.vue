<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatchClient } from '@/composables/useMatchClient'
import { RPS_MOVES, REVEAL_MS, playerLabel } from '@/modules/games/rps.consts'
import type { RpsMove, RpsRevealedMove } from '@/stores/games/games.model'
import RpsHand from '@/modules/games/RpsHand.vue'
import RpsIcon from '@/modules/games/RpsIcon.vue'

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
/** Pełny roster meczu (gracze + goście), włącznie ze mną. */
const roster = client.players
/** Roster bez mnie — pozostali uczestnicy. */
const others = client.opponents

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
function outcomeFor(pid: string): 'win' | 'lose' | 'draw' {
  const pts = roundPointsFor(pid)
  if (pts > 0) return 'win'
  if (pts < 0) return 'lose'
  return 'draw'
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

onUnmounted(() => {
  if (clock) clearInterval(clock)
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
      <header class="game-app__header">
        <div v-if="match && lobbyFull && match.phase !== 'lobby' && match.phase !== 'finished'" class="match-screen__scoreboard match-screen__scoreboard--grid">
          <div
            v-for="pid in roster"
            :key="pid"
            class="score-chip"
            :class="{ 'score-chip--me': pid === meId, 'score-chip--lead': scoreOf(pid) === maxScore }"
          >
            <span class="score-chip__name">{{ playerLabel(pid, meId) }}</span>
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
                {{ playerLabel(pid, meId) }}
              </li>
              <li v-for="n in emptySlots" :key="`empty-${n}`" class="rps-roster__item rps-roster__item--empty">
                <span class="rps-dot" />
                {{ $t('games.lobby.emptySlot') }}
              </li>
            </ul>
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
                {{ playerLabel(pid, meId) }}
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
                :label="playerLabel(pid, meId)"
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
          <ul class="rps-finished__board">
            <li
              v-for="pid in sortedRoster"
              :key="pid"
              class="rps-finished__row"
              :class="{ 'rps-finished__row--me': pid === meId, 'rps-finished__row--winner': leaders.includes(pid) }"
            >
              <span class="rps-finished__name">{{ playerLabel(pid, meId) }}</span>
              <span class="rps-finished__val">{{ scoreOf(pid) }}</span>
            </li>
          </ul>
          <p class="match-screen__target">{{ $t('games.scoreTarget', { target }) }}</p>
          <div class="rps-finished__actions">
            <UiButton icon="caret-left" @click="goBack">{{ $t('games.back') }}</UiButton>
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
</div>
</template>
