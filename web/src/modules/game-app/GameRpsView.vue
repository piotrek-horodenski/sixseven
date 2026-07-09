<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMatchClient } from '@/composables/useMatchClient'
import { RPS_MOVES, REVEAL_MS, playerLabel } from '@/modules/games/rps.consts'
import type { RpsMove } from '@/stores/games/games.model'
import RpsHand from '@/modules/games/RpsHand.vue'
import RpsIcon from '@/modules/games/RpsIcon.vue'

/**
 * Aplikacja gry RPS (`/game/rps`) — standalone, poza AppLayout, BEZ `gate.store`
 * usera. Tożsamość bierze się z tokenu meczu wymienionego z `?handoff=`.
 * Prezentacja reużywa `RpsHand`, `rps.consts` i klas `.rps-*` z modułu 2c.
 */

const route = useRoute()
const client = useMatchClient()

const returnUrl = computed(() => {
  const r = route.query.return
  // Bezpieczny powrót: TYLKO ścieżka lokalna (jeden `/`, bez `//`, `\` ani
  // schematu). Blokuje open-redirect i nawigacyjny kanał eksfiltracji (S3) —
  // złośliwy link pokoju nie przekieruje gracza na obcy origin.
  if (typeof r === 'string' && /^\/(?![/\\])/.test(r)) return r
  return '/rooms'
})

const match = client.match
const meId = computed(() => client.playerId.value)
const oppId = client.opponentId
const oppLabel = computed(() => playerLabel(oppId.value, meId.value))

onMounted(() => {
  const handoff = route.query.handoff
  if (typeof handoff === 'string' && handoff) {
    client.start(handoff)
  } else {
    client.status.value = 'error'
    client.error.value = 'Brak kodu handoffu w adresie — otwórz grę z pokoju.'
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
const oppReady = computed(() => (oppId.value ? !!match.value?.ready?.[oppId.value] : false))
const rejected = computed(() => client.rejected.value)

function pick(move: RpsMove) {
  if (iAmReady.value) return
  selectedMove.value = move
  client.submitMove(move)
}

watch(
  () => match.value?.round,
  () => {
    selectedMove.value = null
  },
)

// ---- reveal ------------------------------------------------------------
const view = computed(() => client.latestView.value?.view ?? null)
const myPick = computed(() => view.value?.moves.find((m) => m.playerId === meId.value) ?? null)
const oppPick = computed(() => view.value?.moves.find((m) => m.playerId === oppId.value) ?? null)
const roundWinner = computed(() => view.value?.roundWinner ?? null)
const roundOutcome = computed<'win' | 'lose' | 'draw'>(() => {
  if (!roundWinner.value) return 'draw'
  return roundWinner.value === meId.value ? 'win' : 'lose'
})

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

// ---- wynik meczu -------------------------------------------------------
const myScore = computed(() => (meId.value ? match.value?.score?.[meId.value] ?? 0 : 0))
const oppScore = computed(() => (oppId.value ? match.value?.score?.[oppId.value] ?? 0 : 0))
const target = computed(() => Number(match.value?.options?.target) || 2)
const matchOutcome = computed<'win' | 'lose' | 'draw'>(() => {
  if (myScore.value === oppScore.value) return 'draw'
  return myScore.value > oppScore.value ? 'win' : 'lose'
})

const cancelReason = computed(() => {
  switch (match.value?.endReason) {
    case 'cancelled_lobby':
      return 'Nikt nie wystartował meczu na czas.'
    case 'cancelled_paused':
      return 'Mecz anulowano po zbyt długiej przerwie (serwis gry nie odpowiadał).'
    case 'walkover':
      return 'Walkower.'
    default:
      return 'Mecz został anulowany.'
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
      <p class="rps-state__text">Łączę z meczem…</p>
    </div>

    <div v-else-if="client.status.value === 'error'" class="rps-state rps-state--muted">
      <fa icon="times-circle" class="rps-state__glyph" />
      <h2 class="rps-state__title">Nie udało się wejść do gry</h2>
      <p class="rps-state__text">{{ client.error.value }}</p>
      <button class="rps-finished__list" type="button" @click="goBack">Powrót</button>
    </div>

    <template v-else>
      <header class="game-app__header">
        <div v-if="match" class="match-screen__scoreboard">
          <div class="score-chip score-chip--me">
            <span class="score-chip__name">Ty</span>
            <span class="score-chip__val">{{ myScore }}</span>
          </div>
          <span class="match-screen__target">do {{ target }}</span>
          <div class="score-chip">
            <span class="score-chip__name">{{ oppLabel }}</span>
            <span class="score-chip__val">{{ oppScore }}</span>
          </div>
        </div>
      </header>

      <div v-if="match" class="rps-board">
        <!-- LOBBY -->
        <div v-if="match.phase === 'lobby'" class="rps-state rps-lobby">
          <fa icon="hand-scissors" class="rps-state__glyph" />
          <h2 class="rps-state__title">Mecz gotowy</h2>
          <p class="rps-state__text">Grasz z {{ oppLabel }} do {{ target }} zwycięstw. Czekaj na start…</p>
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

          <p class="rps-planning__prompt">Runda {{ match.round }} — wybierz ruch</p>

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
              <span class="rps-move__label">{{ mv.label }}</span>
            </button>
          </div>

          <p v-if="rejected" class="rps-planning__rejected">
            <fa icon="exclamation-circle" /> Ruch odrzucony — wybierz jeszcze raz.
          </p>
          <p v-else-if="iAmReady" class="rps-planning__waiting">
            <fa icon="circle-notch" class="rotate" />
            Ruch złożony. Czekam na {{ oppLabel }}…
          </p>
          <p v-else class="rps-planning__opponent">
            <span class="rps-dot" :class="{ 'rps-dot--on': oppReady }" />
            {{ oppReady ? `${oppLabel} już wybrał` : `${oppLabel} jeszcze wybiera` }}
          </p>
        </div>

        <!-- RESOLVING -->
        <div v-else-if="match.phase === 'resolving'" class="rps-state">
          <fa icon="circle-notch" class="rotate rps-state__glyph" />
          <p class="rps-state__text">Rozstrzygam rundę…</p>
        </div>

        <!-- REVEALING -->
        <div v-else-if="match.phase === 'revealing'" class="rps-reveal">
          <div class="rps-reveal__hands">
            <RpsHand
              :move="(myPick?.move as RpsMove) ?? null"
              :revealed="revealed"
              :outcome="revealed ? roundOutcome : null"
              :defaulted="myPick?.defaulted"
              label="Ty"
            />
            <span class="rps-reveal__vs">vs</span>
            <RpsHand
              :move="(oppPick?.move as RpsMove) ?? null"
              :revealed="revealed"
              :outcome="revealed ? (roundOutcome === 'win' ? 'lose' : roundOutcome === 'lose' ? 'win' : 'draw') : null"
              :defaulted="oppPick?.defaulted"
              :label="oppLabel"
            />
          </div>

          <Transition name="rps-verdict">
            <p
              v-if="revealed"
              class="rps-reveal__verdict"
              :class="`rps-reveal__verdict--${roundOutcome}`"
            >
              {{ roundOutcome === 'win' ? 'Wygrywasz rundę!' : roundOutcome === 'lose' ? 'Runda dla przeciwnika' : 'Remis' }}
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
            {{ matchOutcome === 'win' ? 'Wygrałeś!' : matchOutcome === 'lose' ? 'Przegrałeś' : 'Remis' }}
          </h2>
          <p class="rps-finished__score">{{ myScore }} : {{ oppScore }}</p>
          <div class="rps-finished__actions">
            <UiButton icon="caret-left" @click="goBack">Powrót</UiButton>
          </div>
        </div>

        <!-- PAUSED -->
        <div v-else-if="match.phase === 'paused'" class="rps-state rps-state--warn">
          <fa icon="circle-notch" class="rotate rps-state__glyph" />
          <h2 class="rps-state__title">Wstrzymano</h2>
          <p class="rps-state__text">Serwis gry chwilowo nie odpowiada. Próbuję wznowić automatycznie…</p>
        </div>

        <!-- CANCELLED -->
        <div v-else-if="match.phase === 'cancelled'" class="rps-state rps-state--muted">
          <fa icon="times-circle" class="rps-state__glyph" />
          <h2 class="rps-state__title">Mecz anulowany</h2>
          <p class="rps-state__text">{{ cancelReason }}</p>
          <button class="rps-finished__list" type="button" @click="goBack">Powrót</button>
        </div>
      </div>

      <div v-else class="rps-state">
        <fa icon="circle-notch" class="rotate rps-state__glyph" />
        <p class="rps-state__text">Ładuję mecz…</p>
      </div>
    </template>
  </div>
</div>
</template>
