<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePermission } from '@/composables/usePermission'
import { useCatalogStore } from '@/stores/games/catalog.store'
import {
  GAME_ID_PATTERN,
  MIN_PLANNING_PHASE_MS,
  type CatalogGame,
} from '@/stores/games/catalog.model'
import { EMessageType, EPopupSize } from '@/controls/controls.model'

/**
 * Widok dewelopera „Moje gry" (`/dev`, Etap 4d):
 *  - brak roli developer → CTA „Zostań deweloperem" (dev:enroll, self-service),
 *  - formularz rejestracji gry (gameId, name, serviceUrl, uiUrl + manifest:
 *    version, minPlayers, maxPlayers, planningPhaseMs) → dev:register-game,
 *  - po complete: hmacSecret pokazany JEDEN RAZ (popup z kopiowaniem),
 *  - lista własnych gier ze statusami (subskrypcja `games` — polityka gate
 *    oddaje własne, w tym `registered`),
 *  - edycja (serviceUrl/uiUrl/manifest) → dev:update-game — z komunikatem, że
 *    gra WRACA do zatwierdzenia (status `registered`).
 *
 * Walidacja lokalna trzyma KLUCZE i18n w stanie (t() per render) — determinizm.
 */
const { hasPermission } = usePermission()
const catalog = useCatalogStore()
const { enrolling, enrolled, registering, updating, lastSecret, lastError, myGames } =
  storeToRefs(catalog)

onMounted(() => catalog.init())
onUnmounted(() => catalog.cleanup())

// Uprawnienie `register-games` przychodzi z rolą developer. Po dev:enroll token
// sesji nie odświeża uprawnień do reconnectu — `enrolled` odblokowuje widok od razu.
const isDeveloper = computed(() => hasPermission('register-games') || enrolled.value)

// ---- formularz -------------------------------------------------------------

/** Edytowana gra (null = tryb rejestracji nowej). */
const editingId = ref<string | null>(null)
const gameIdInput = ref('')
const nameInput = ref('')
const serviceUrlInput = ref('')
const uiUrlInput = ref('')
const versionInput = ref('1.0.0')
const minPlayersInput = ref('2')
const maxPlayersInput = ref('2')
const planningMsInput = ref('10000')

/** Klucz i18n błędu walidacji (NIE przetłumaczony string — determinizm). */
const validationKey = ref<string | null>(null)

function resetForm() {
  editingId.value = null
  gameIdInput.value = ''
  nameInput.value = ''
  serviceUrlInput.value = ''
  uiUrlInput.value = ''
  versionInput.value = '1.0.0'
  minPlayersInput.value = '2'
  maxPlayersInput.value = '2'
  planningMsInput.value = '10000'
  validationKey.value = null
}

function startEdit(game: CatalogGame) {
  editingId.value = game._id
  gameIdInput.value = game._id
  nameInput.value = game.name
  // serviceUrl NIE występuje w publicznym katalogu — przy edycji pole zostaje
  // puste; wysyłamy je tylko, gdy deweloper wpisze nową wartość.
  serviceUrlInput.value = ''
  uiUrlInput.value = game.uiUrl ?? ''
  versionInput.value = game.manifest?.version ?? '1.0.0'
  minPlayersInput.value = String(game.manifest?.minPlayers ?? 2)
  maxPlayersInput.value = String(game.manifest?.maxPlayers ?? 2)
  planningMsInput.value = String(game.manifest?.planningPhaseMs ?? MIN_PLANNING_PHASE_MS)
  validationKey.value = null
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Walidacja lokalna — zwraca klucz i18n błędu albo null. */
function validate(): string | null {
  const isEdit = !!editingId.value
  const minPlayers = Math.floor(Number(minPlayersInput.value))
  const maxPlayers = Math.floor(Number(maxPlayersInput.value))
  const planningMs = Math.floor(Number(planningMsInput.value))

  if (!isEdit) {
    if (!gameIdInput.value || !nameInput.value.trim() || !serviceUrlInput.value || !uiUrlInput.value) {
      return 'dev.form.errors.required'
    }
    if (!GAME_ID_PATTERN.test(gameIdInput.value)) return 'dev.form.errors.gameIdFormat'
  }
  if (!versionInput.value || !SEMVER_PATTERN.test(versionInput.value)) {
    return 'dev.form.errors.version'
  }
  // Przy edycji puste pola URL pomijamy (patch częściowy); przy rejestracji
  // oba są wymagane (sprawdzone wyżej) — walidujemy wszystko, co niepuste.
  const urlsToCheck: string[] = []
  if (serviceUrlInput.value || !isEdit) urlsToCheck.push(serviceUrlInput.value)
  if (uiUrlInput.value || !isEdit) urlsToCheck.push(uiUrlInput.value)
  if (urlsToCheck.some((u) => !isHttpUrl(u))) return 'dev.form.errors.url'
  if (!Number.isFinite(minPlayers) || minPlayers < 2 || !Number.isFinite(maxPlayers) || maxPlayers < minPlayers) {
    return 'dev.form.errors.players'
  }
  if (!Number.isFinite(planningMs) || planningMs < MIN_PLANNING_PHASE_MS) {
    return 'dev.form.errors.planning'
  }
  return null
}

function buildManifest() {
  return {
    version: versionInput.value,
    minPlayers: Math.floor(Number(minPlayersInput.value)),
    maxPlayers: Math.floor(Number(maxPlayersInput.value)),
    planningPhaseMs: Math.floor(Number(planningMsInput.value)),
  }
}

function submit() {
  if (registering.value || updating.value) return
  validationKey.value = validate()
  if (validationKey.value) return

  if (editingId.value) {
    // Edycja: wysyłamy tylko wypełnione pola (serviceUrl opcjonalnie) —
    // KAŻDA zmiana i tak cofa status do `registered`.
    const patch: { serviceUrl?: string; uiUrl?: string; manifest?: ReturnType<typeof buildManifest> } = {
      manifest: buildManifest(),
    }
    if (serviceUrlInput.value) patch.serviceUrl = serviceUrlInput.value
    if (uiUrlInput.value) patch.uiUrl = uiUrlInput.value
    catalog.updateGame(editingId.value, patch)
  } else {
    catalog.registerGame({
      gameId: gameIdInput.value,
      name: nameInput.value.trim(),
      serviceUrl: serviceUrlInput.value,
      uiUrl: uiUrlInput.value,
      manifest: buildManifest(),
    })
  }
}

// Po udanej rejestracji/edycji — wyczyść formularz (sekret pokazuje popup).
watch(lastSecret, (s) => {
  if (s) resetForm()
})
watch(
  () => catalog.lastUpdatedGameId,
  (id) => {
    if (id) resetForm()
  },
)

// ---- sekret HMAC (pokazany RAZ) ---------------------------------------------

const secretCopied = ref(false)
async function copySecret() {
  const s = lastSecret.value
  if (!s) return
  try {
    await navigator.clipboard.writeText(s.hmacSecret)
    secretCopied.value = true
    window.setTimeout(() => (secretCopied.value = false), 1500)
  } catch {
    /* kopiowanie niedostępne — deweloper może zaznaczyć ręcznie */
  }
}
function closeSecret() {
  secretCopied.value = false
  catalog.clearSecret()
}

/** Klucz i18n statusu gry (klucze w stałej — determinizm). */
const STATUS_KEYS: Record<string, string> = {
  registered: 'dev.list.statuses.registered',
  published: 'dev.list.statuses.published',
  unpublished: 'dev.list.statuses.unpublished',
}
</script>
<template>
<div class="dev-games">
  <!-- CTA: zostań deweloperem (self-service dev:enroll) -->
  <div v-if="!isDeveloper" class="dev-games__enroll">
    <fa icon="code" class="dev-games__enroll-glyph" />
    <h2 class="dev-games__enroll-title">{{ $t('dev.enroll.title') }}</h2>
    <p class="dev-games__enroll-body">{{ $t('dev.enroll.body') }}</p>
    <UiButton icon="code" :loading="enrolling" @click="catalog.enroll()">
      {{ $t('dev.enroll.cta') }}
    </UiButton>
    <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>
  </div>

  <template v-else>
    <!-- Formularz rejestracji / edycji -->
    <section class="dev-games__form">
      <h2 class="dev-games__form-title">
        {{ editingId ? $t('dev.form.editTitle', { gameId: editingId }) : $t('dev.form.createTitle') }}
      </h2>

      <UiMessage v-if="editingId" :type="EMessageType.warning">
        {{ $t('dev.form.editWarning') }}
      </UiMessage>

      <div v-if="!editingId" class="dev-games__field">
        <UiInput
          :modelValue="gameIdInput"
          @update:modelValue="(v: string) => (gameIdInput = v)"
          placeholder="moja-gra"
        >{{ $t('dev.form.gameId') }}</UiInput>
        <p class="dev-games__hint">{{ $t('dev.form.gameIdHint') }}</p>
      </div>

      <div v-if="!editingId" class="dev-games__field">
        <UiInput
          :modelValue="nameInput"
          @update:modelValue="(v: string) => (nameInput = v)"
        >{{ $t('dev.form.name') }}</UiInput>
      </div>

      <div class="dev-games__field">
        <UiInput
          :modelValue="serviceUrlInput"
          @update:modelValue="(v: string) => (serviceUrlInput = v)"
          placeholder="https://"
        >{{ $t('dev.form.serviceUrl') }}</UiInput>
      </div>

      <div class="dev-games__field">
        <UiInput
          :modelValue="uiUrlInput"
          @update:modelValue="(v: string) => (uiUrlInput = v)"
          placeholder="https://"
        >{{ $t('dev.form.uiUrl') }}</UiInput>
        <p class="dev-games__hint">{{ $t('dev.form.urlHint') }}</p>
      </div>

      <div class="dev-games__row">
        <div class="dev-games__field">
          <UiInput
            :modelValue="versionInput"
            @update:modelValue="(v: string) => (versionInput = v)"
            placeholder="1.0.0"
          >{{ $t('dev.form.version') }}</UiInput>
        </div>
        <div class="dev-games__field">
          <UiInput
            :modelValue="minPlayersInput"
            @update:modelValue="(v: string) => (minPlayersInput = v)"
            type="number"
            min="2"
            inputmode="numeric"
          >{{ $t('dev.form.minPlayers') }}</UiInput>
        </div>
        <div class="dev-games__field">
          <UiInput
            :modelValue="maxPlayersInput"
            @update:modelValue="(v: string) => (maxPlayersInput = v)"
            type="number"
            min="2"
            inputmode="numeric"
          >{{ $t('dev.form.maxPlayers') }}</UiInput>
        </div>
        <div class="dev-games__field">
          <UiInput
            :modelValue="planningMsInput"
            @update:modelValue="(v: string) => (planningMsInput = v)"
            type="number"
            :min="MIN_PLANNING_PHASE_MS"
            inputmode="numeric"
          >{{ $t('dev.form.planningPhaseMs') }}</UiInput>
          <p class="dev-games__hint">{{ $t('dev.form.planningPhaseHint') }}</p>
        </div>
      </div>

      <UiMessage v-if="validationKey" :type="EMessageType.error">{{ $t(validationKey) }}</UiMessage>
      <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

      <div class="dev-games__actions">
        <UiButton v-if="editingId" class="accent" @click="resetForm">
          {{ $t('dev.form.cancelEdit') }}
        </UiButton>
        <UiButton
          icon="plus"
          :loading="registering || updating"
          @click="submit"
        >{{ editingId ? $t('dev.form.submitEdit') : $t('dev.form.submitCreate') }}</UiButton>
      </div>
    </section>

    <!-- Lista własnych gier ze statusami -->
    <section class="dev-games__list">
      <h2 class="dev-games__list-title">{{ $t('dev.list.title') }}</h2>
      <p v-if="!myGames.length" class="dev-games__empty">{{ $t('dev.list.empty') }}</p>
      <ul v-else class="dev-games__items">
        <li v-for="g in myGames" :key="g._id" class="dev-game">
          <div class="dev-game__main">
            <span class="dev-game__name">{{ g.name }}</span>
            <span class="dev-game__slug">{{ g._id }}</span>
            <span class="dev-game__meta">
              {{ $t('dev.list.version') }}: {{ g.manifest?.version }} ·
              {{ $t('dev.list.players') }}: {{ g.manifest?.minPlayers }}–{{ g.manifest?.maxPlayers }}
            </span>
          </div>
          <div class="dev-game__side">
            <span class="dev-game__status" :class="`dev-game__status--${g.status}`">
              {{ $t(STATUS_KEYS[g.status] ?? '') || g.status }}
            </span>
            <UiButton icon="edit" @click="startEdit(g)">{{ $t('dev.list.edit') }}</UiButton>
          </div>
        </li>
      </ul>
    </section>
  </template>

  <!-- Sekret HMAC — pokazany JEDEN RAZ po rejestracji -->
  <UiPopup :show="!!lastSecret" :size="EPopupSize.regular" @update:show="closeSecret">
    <template #title>{{ $t('dev.secret.title') }}</template>
    <div class="dev-secret">
      <UiMessage :type="EMessageType.warning">{{ $t('dev.secret.body') }}</UiMessage>
      <p class="dev-secret__label">{{ $t('dev.secret.label', { gameId: lastSecret?.gameId }) }}</p>
      <div class="dev-secret__row">
        <input
          class="dev-secret__value"
          :value="lastSecret?.hmacSecret"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        />
        <UiButton :icon="secretCopied ? 'check' : 'copy'" @click="copySecret">
          {{ secretCopied ? $t('common.copied') : $t('common.copy') }}
        </UiButton>
      </div>
      <div class="dev-secret__actions">
        <UiButton icon="check" @click="closeSecret">{{ $t('dev.secret.done') }}</UiButton>
      </div>
    </div>
  </UiPopup>
</div>
</template>
