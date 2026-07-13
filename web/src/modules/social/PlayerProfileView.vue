<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGateStore } from '@/stores/gate/gate.store'
import { useCollection, type UseCollection } from '@/composables/useCollection'
import type { Annotation, PublicProfile } from '@/stores/social/community.model'
import type { Rating } from '@/stores/games/ranked.model'
import AnnotationsBadges from './AnnotationsBadges.vue'

/**
 * Publiczny profil gracza (`/u/:userId`, slot `default`). Woła RPC
 * `profile:get { userId }` (display + historia meczów) i renderuje agregat
 * win/loss/draw per gra oraz listę ostatnich meczów. Sekcja odznak pochodzi z
 * SUBSKRYPCJI `annotations` (`{ playerId }`) — polityka serwera przepuszcza
 * tylko pozytywne + własne. Nie mieszamy tych dwóch źródeł: historia idzie RPC,
 * odznaki subskrypcją (zgodnie z kontraktem A2/A5).
 *
 * Etap 4e: sekcja ELO per gra — SUBSKRYPCJA publicznej kolekcji `ratings`
 * z filtrem `{ userId }` (ten sam wzorzec co annotations).
 */
const route = useRoute()
const { t } = useI18n()
const gate = useGateStore()

const userId = computed<string>(() => String(route.params.userId || ''))

const profile = ref<PublicProfile | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// ---- adnotacje (subskrypcja) --------------------------------------------
// Kolekcja w shallowRef, żeby `liveBadges` pozostało reaktywne po zmianie userId.
// shallowRef (nie ref): ref rozpakowałby wewnętrzny `docs: Ref<T[]>` (UnwrapRef).
const annotationsCol = shallowRef<UseCollection<Annotation> | null>(null)
const liveBadges = computed<Annotation[]>(() => annotationsCol.value?.docs.value ?? [])

// ---- ELO (subskrypcja ratings po userId, 4e) ------------------------------
const ratingsCol = shallowRef<UseCollection<Rating> | null>(null)
const eloRows = computed<Rating[]>(() =>
  [...(ratingsCol.value?.docs.value ?? [])].sort((a, b) => b.elo - a.elo),
)

// ---- RPC profile:get -----------------------------------------------------
function onProfile({ profile: p }: { profile: PublicProfile }) {
  if (!p || p.userId !== userId.value) return
  profile.value = p
  loading.value = false
  error.value = null
}
function onProfileError({ message }: { message?: string }) {
  loading.value = false
  error.value = message || t('community.profile.loadFailed')
}

function registerAcks() {
  const s = gate.socket
  if (!s) return
  s.off('profile:get-complete', onProfile)
  s.off('profile:get-error', onProfileError)
  s.on('profile:get-complete', onProfile)
  s.on('profile:get-error', onProfileError)
}
function unregisterAcks() {
  const s = gate.socket
  if (!s) return
  s.off('profile:get-complete', onProfile)
  s.off('profile:get-error', onProfileError)
}

function fetchProfile() {
  loading.value = true
  error.value = null
  profile.value = null
  gate.call('profile:get', { userId: userId.value })
}

function startAnnotations() {
  annotationsCol.value?.stop()
  const c = useCollection<Annotation>('annotations', { playerId: userId.value })
  annotationsCol.value = c
  c.start()
}

function startRatings() {
  ratingsCol.value?.stop()
  const c = useCollection<Rating>('ratings', { userId: userId.value })
  ratingsCol.value = c
  c.start()
}

function load() {
  if (!userId.value) return
  fetchProfile()
  startAnnotations()
  startRatings()
}

onMounted(() => {
  registerAcks()
  gate.onReconnect(registerAcks)
  load()
})

watch(userId, (next, prev) => {
  if (next && next !== prev) load()
})

onUnmounted(() => {
  unregisterAcks()
  gate.offReconnect(registerAcks)
  annotationsCol.value?.stop()
  annotationsCol.value = null
  ratingsCol.value?.stop()
  ratingsCol.value = null
})

// ---- pochodne dla widoku -------------------------------------------------
const display = computed(() => profile.value?.display || userId.value)
const games = computed(() => profile.value?.history?.games ?? [])
const recent = computed(() => profile.value?.history?.recent ?? [])

function formatDate(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString()
}
</script>
<template>
<div class="player-profile">
  <div v-if="loading" class="player-profile__state">
    <fa icon="circle-notch" class="rotate player-profile__glyph" />
    <p>{{ $t('community.profile.loading') }}</p>
  </div>

  <div v-else-if="error" class="player-profile__state player-profile__state--error">
    <fa icon="times-circle" class="player-profile__glyph" />
    <p>{{ error }}</p>
  </div>

  <template v-else>
    <header class="player-profile__header">
      <fa icon="user" class="player-profile__avatar" />
      <h1 class="player-profile__display">{{ display }}</h1>
    </header>

    <!-- Odznaki (subskrypcja annotations) -->
    <section class="player-profile__section">
      <h2 class="player-profile__section-title">{{ $t('community.profile.badges') }}</h2>
      <AnnotationsBadges :badges="liveBadges" />
    </section>

    <!-- ELO per gra (subskrypcja ratings, 4e) -->
    <section class="player-profile__section">
      <h2 class="player-profile__section-title">{{ $t('community.profile.elo') }}</h2>
      <p v-if="!eloRows.length" class="player-profile__empty">{{ $t('community.profile.eloEmpty') }}</p>
      <table v-else class="player-profile__table">
        <thead>
          <tr>
            <th>{{ $t('community.profile.eloGame') }}</th>
            <th>{{ $t('community.profile.eloRating') }}</th>
            <th>{{ $t('community.profile.eloMatches') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in eloRows" :key="r._id">
            <td>{{ r.gameId }}</td>
            <td class="player-profile__win">{{ r.elo }}</td>
            <td>{{ r.matches }}</td>
            <td>
              <RouterLink :to="`/ranking/${r.gameId}`" class="player-profile__ranking-link">
                {{ $t('community.profile.eloRankingLink') }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Historia: agregat per gra -->
    <section class="player-profile__section">
      <h2 class="player-profile__section-title">{{ $t('community.profile.history') }}</h2>
      <p v-if="!games.length" class="player-profile__empty">{{ $t('community.profile.historyEmpty') }}</p>
      <table v-else class="player-profile__table">
        <thead>
          <tr>
            <th>{{ $t('community.profile.game') }}</th>
            <th>{{ $t('community.profile.played') }}</th>
            <th>{{ $t('community.profile.wins') }}</th>
            <th>{{ $t('community.profile.losses') }}</th>
            <th>{{ $t('community.profile.draws') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in games" :key="g.gameId">
            <td>{{ g.gameId }}</td>
            <td>{{ g.played }}</td>
            <td class="player-profile__win">{{ g.wins }}</td>
            <td class="player-profile__loss">{{ g.losses }}</td>
            <td class="player-profile__draw">{{ g.draws }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Ostatnie mecze -->
    <section class="player-profile__section">
      <h2 class="player-profile__section-title">{{ $t('community.profile.recent') }}</h2>
      <p v-if="!recent.length" class="player-profile__empty">{{ $t('community.profile.recentEmpty') }}</p>
      <ul v-else class="player-profile__recent">
        <li
          v-for="r in recent"
          :key="r.matchId"
          class="profile-match"
          :class="`profile-match--${r.result}`"
        >
          <span class="profile-match__game">{{ r.gameId }}</span>
          <span class="profile-match__result">{{ $t(`community.profile.result.${r.result}`) }}</span>
          <span class="profile-match__date">{{ formatDate(r.finishedAt) }}</span>
        </li>
      </ul>
    </section>
  </template>
</div>
</template>
