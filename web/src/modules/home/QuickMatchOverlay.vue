<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useQueueStore } from '@/stores/games/queue.store'
import { useCatalogStore } from '@/stores/games/catalog.store'
import { useRoomsStore } from '@/stores/rooms/rooms.store'
import { EPopupSize } from '@/controls/controls.model'

/**
 * Overlay kolejki szybkiego meczu (4e) — renderowany na Home. Steruje nim
 * WYŁĄCZNIE własny wpis `queue` (subskrypcja, row-level):
 *  - `waiting`  → „szukam przeciwnika" + czas od `since` + Anuluj (queue:leave),
 *  - `proposed` → dialog akceptu z odliczaniem do `proposalDeadline`
 *                 (queue:accept; brak akceptu = wpis sam wygaśnie po stronie games),
 *  - `matched`  → `games:request-handoff` (raz per matchId, przez rooms.store) —
 *                 redirect robi HomeView (wspólny watch `lastHandoff` → launch).
 *
 * Cykl życia store'ów jest refcountowany, więc równoległy init z HomeView
 * jest bezpieczny.
 */
const queue = useQueueStore()
const catalog = useCatalogStore()
const rooms = useRoomsStore()

onMounted(() => {
  queue.init()
  rooms.init()
})
onUnmounted(() => {
  queue.cleanup()
  rooms.cleanup()
})

const entry = computed(() => queue.activeEntry)
const game = computed(() => catalog.gameById(entry.value?.gameId))
const gameName = computed(() => game.value?.name ?? entry.value?.gameId ?? '')

// ---- zegar (czas w kolejce / odliczanie akceptu) -------------------------
const now = ref(Date.now())
let clock: number | undefined
onMounted(() => {
  clock = window.setInterval(() => (now.value = Date.now()), 250)
})
onUnmounted(() => {
  if (clock) window.clearInterval(clock)
})

/** Sekundy od wejścia do kolejki (`since`). */
const waitingSeconds = computed(() => {
  const e = entry.value
  if (!e) return 0
  return Math.max(0, Math.floor((now.value - e.since) / 1000))
})

/** Sekundy do wygaśnięcia propozycji (`proposalDeadline`). */
const acceptSeconds = computed(() => {
  const e = entry.value
  if (!e?.proposalDeadline) return 0
  return Math.max(0, Math.ceil((e.proposalDeadline - now.value) / 1000))
})

function cancel() {
  const e = entry.value
  if (e) queue.leave(e.gameId)
}

function accept() {
  const e = entry.value
  if (e?.proposalId) queue.accept(e.gameId, e.proposalId)
}

/** Czy JA już zaakceptowałem tę propozycję (ack złapany, czekamy na drugiego). */
const iAccepted = ref(false)
watch(
  () => entry.value?.proposalId,
  () => (iAccepted.value = false),
)
watch(
  () => queue.accepting,
  (v, old) => {
    // accepting przechodzi true→false po acku complete (błąd czyści osobno).
    if (old && !v && !queue.lastError) iAccepted.value = true
  },
)

// ---- matched → handoff (raz per matchId) ----------------------------------
const handoffRequested = new Set<string>()
watch(
  () => entry.value?.matchId,
  (matchId) => {
    if (!matchId || entry.value?.status !== 'matched') return
    if (handoffRequested.has(matchId)) return
    handoffRequested.add(matchId)
    rooms.enterGame(matchId)
  },
  { immediate: true },
)

const show = computed(() => !!entry.value)
</script>
<template>
<UiPopup :show="show" :size="EPopupSize.thin" :closable="false">
  <template #title>
    <template v-if="entry?.status === 'proposed'">{{ $t('home.quick.proposedTitle') }}</template>
    <template v-else-if="entry?.status === 'matched'">{{ $t('home.quick.matchedTitle') }}</template>
    <template v-else>{{ $t('home.quick.waitingTitle') }}</template>
  </template>

  <div v-if="entry" class="quick-match">
    <!-- WAITING: czas od since + anuluj -->
    <template v-if="entry.status === 'waiting'">
      <fa icon="circle-notch" class="rotate quick-match__glyph" />
      <p class="quick-match__body">
        {{ $t('home.quick.waitingBody', { game: gameName, seconds: waitingSeconds }) }}
      </p>
      <div class="quick-match__actions">
        <UiButton icon="times" @click="cancel">{{ $t('home.quick.cancel') }}</UiButton>
      </div>
    </template>

    <!-- PROPOSED: odliczanie do proposalDeadline + akcept -->
    <template v-else-if="entry.status === 'proposed'">
      <fa icon="bolt" class="quick-match__glyph quick-match__glyph--hot" />
      <p class="quick-match__body">
        {{ $t('home.quick.proposedBody', { seconds: acceptSeconds }) }}
      </p>
      <p class="quick-match__countdown">{{ acceptSeconds }}</p>
      <div class="quick-match__actions">
        <UiButton class="accent" @click="cancel">{{ $t('home.quick.decline') }}</UiButton>
        <UiButton
          icon="check"
          :loading="queue.accepting"
          :disabled="iAccepted"
          @click="accept"
        >{{ $t('home.quick.accept') }}</UiButton>
      </div>
    </template>

    <!-- MATCHED: handoff w toku -->
    <template v-else>
      <fa icon="circle-notch" class="rotate quick-match__glyph" />
      <p class="quick-match__body">{{ $t('home.quick.matchedBody') }}</p>
    </template>

    <UiMessage v-if="queue.lastError" type="error">{{ queue.lastError }}</UiMessage>
  </div>
</UiPopup>
</template>
