<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGamesStore } from '@/stores/games/games.store'
import { RPS_MOVES, REVEAL_MS, playerLabel } from './rps.consts'
import type { Match, RpsMove } from '@/stores/games/games.model'
import RpsHand from './RpsHand.vue'

const props = defineProps<{ match: Match }>()

const router = useRouter()
const games = useGamesStore()

const meId = computed(() => games.currentUserId)
const oppId = computed(() => games.opponentId(props.match))
const oppLabel = computed(() => playerLabel(oppId.value, meId.value))

// ---- zegar / odliczanie ------------------------------------------------
const now = ref(Date.now())
let clock: number | undefined
onMounted(() => {
  clock = window.setInterval(() => (now.value = Date.now()), 200)
})
onUnmounted(() => {
  if (clock) clearInterval(clock)
  clearRevealTimers()
})

const planningTotal = ref(0)
const remainingMs = computed(() => {
  if (props.match.phase !== 'planning' || !props.match.deadline) return 0
  return Math.max(0, props.match.deadline - now.value)
})
const remainingSec = computed(() => Math.ceil(remainingMs.value / 1000))

const RING_CIRC = 2 * Math.PI * 42
const ringOffset = computed(() => {
  const frac = planningTotal.value > 0 ? Math.min(1, Math.max(0, remainingMs.value / planningTotal.value)) : 0
  return RING_CIRC * (1 - frac)
})
const timeLow = computed(() => remainingMs.value > 0 && remainingMs.value <= 3000)

// ---- ruch gracza -------------------------------------------------------
const selectedMove = ref<RpsMove | null>(null)

const iAmReady = computed(() => (meId.value ? !!props.match.ready?.[meId.value] : false))
const oppReady = computed(() => (oppId.value ? !!props.match.ready?.[oppId.value] : false))
const rejected = computed(() => games.rejectedMatchIds.has(props.match._id))

function pick(move: RpsMove) {
  if (iAmReady.value) return
  selectedMove.value = move
  games.submitMove(props.match._id, move)
}

// Nowa runda: wyczyść lokalny wybór.
watch(
  () => props.match.round,
  () => {
    selectedMove.value = null
  },
)

// ---- reveal ------------------------------------------------------------
const view = computed(() => games.latestView(props.match._id)?.view ?? null)
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
  () => props.match.phase,
  (phase) => {
    clearRevealTimers()
    revealed.value = false
    if (phase === 'planning' && props.match.deadline) {
      planningTotal.value = Math.max(1, props.match.deadline - Date.now())
    }
    if (phase === 'revealing') {
      revealFlip = window.setTimeout(() => (revealed.value = true), 650)
      const round = props.match.round
      revealAdvance = window.setTimeout(() => {
        if (!emittedReveal.has(round)) {
          emittedReveal.add(round)
          games.revealDone(props.match._id)
        }
      }, REVEAL_MS)
    }
  },
  { immediate: true },
)

// ---- wynik meczu -------------------------------------------------------
const myScore = computed(() => (meId.value ? props.match.score?.[meId.value] ?? 0 : 0))
const oppScore = computed(() => (oppId.value ? props.match.score?.[oppId.value] ?? 0 : 0))
const matchOutcome = computed<'win' | 'lose' | 'draw'>(() => {
  if (myScore.value === oppScore.value) return 'draw'
  return myScore.value > oppScore.value ? 'win' : 'lose'
})

// ---- akcje -------------------------------------------------------------
function start() {
  games.start(props.match._id)
}

const awaitingNav = ref(false)
function rematch() {
  if (!oppId.value) return
  awaitingNav.value = true
  games.createRpsMatch(oppId.value, Number(props.match.options?.target) || 2, props.match.ranked)
}
watch(
  () => games.lastCreatedMatchId,
  (id) => {
    if (id && awaitingNav.value) {
      awaitingNav.value = false
      router.push(`/play/${id}`)
    }
  },
)

const cancelReason = computed(() => {
  switch (props.match.endReason) {
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
</script>
<template>
<div class="rps-board">
  <!-- LOBBY: mecz utworzony, czeka na start -->
  <div v-if="match.phase === 'lobby'" class="rps-state rps-lobby">
    <fa icon="hand-scissors" class="rps-state__glyph" />
    <h2 class="rps-state__title">Mecz gotowy</h2>
    <p class="rps-state__text">Grasz z {{ oppLabel }} do {{ Number(match.options?.target) || 2 }} zwycięstw.</p>
    <UiButton icon="play" @click="start">Start</UiButton>
  </div>

  <!-- PLANNING: wybór ruchu -->
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

    <p class="rps-planning__prompt">
      Runda {{ match.round }} — wybierz ruch
    </p>

    <div class="rps-moves" :class="{ 'rps-moves--locked': iAmReady }">
      <button
        v-for="m in RPS_MOVES"
        :key="m.move"
        type="button"
        class="rps-move"
        :class="{ 'rps-move--selected': selectedMove === m.move }"
        :disabled="iAmReady"
        @click="pick(m.move)"
      >
        <fa :icon="m.icon" class="rps-move__icon" />
        <span class="rps-move__label">{{ m.label }}</span>
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

  <!-- RESOLVING: rozstrzyganie -->
  <div v-else-if="match.phase === 'resolving'" class="rps-state">
    <fa icon="circle-notch" class="rotate rps-state__glyph" />
    <p class="rps-state__text">Rozstrzygam rundę…</p>
  </div>

  <!-- REVEALING: odsłona -->
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

  <!-- FINISHED: wynik meczu -->
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
      <UiButton icon="rotate-right" :loading="awaitingNav" @click="rematch">Rewanż</UiButton>
      <RouterLink to="/play" class="rps-finished__list">Do listy meczów</RouterLink>
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
    <RouterLink to="/play" class="rps-finished__list">Do listy meczów</RouterLink>
  </div>
</div>
</template>
