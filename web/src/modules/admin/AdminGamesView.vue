<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCatalogStore } from '@/stores/games/catalog.store'
import { EMessageType } from '@/controls/controls.model'

/**
 * Moderacja katalogu gier (`/admin/games`, Etap 4d): lista gier zewnętrznych
 * z akcjami Approve (`admin:games-approve`, registered/unpublished → published)
 * i Unpublish (`admin:games-unpublish`, published → unpublished). Dane z tej
 * samej subskrypcji `games` co katalog — polityka gate oddaje adminowi
 * (`manage-games`) pełen katalog, w tym cudze `registered`.
 * Guard trasy: `meta.requiredPermission: 'manage-games'` (istniejący mechanizm).
 */
const catalog = useCatalogStore()
const { externalGames, lastError, moderatingId } = storeToRefs(catalog)

onMounted(() => catalog.init())
onUnmounted(() => catalog.cleanup())

const pending = computed(() => externalGames.value.filter((g) => g.status === 'registered'))

/** Klucz i18n statusu (klucze w stałej — determinizm). */
const STATUS_KEYS: Record<string, string> = {
  registered: 'admin.gameStatuses.registered',
  published: 'admin.gameStatuses.published',
  unpublished: 'admin.gameStatuses.unpublished',
}

/** Kolory tagów statusu — wzorzec `roleColors` z AdminUsersView. */
const statusColors: Record<string, string> = {
  registered: '#f0b078',
  published: '#81c784',
  unpublished: '#9e9e9e',
}
</script>
<template>
<div class="admin-games">
  <div class="admin-games__header">
    <h2>{{ $t('admin.gamesPendingTitle') }}</h2>
  </div>

  <UiMessage v-if="lastError" :type="EMessageType.error">{{ lastError }}</UiMessage>

  <p v-if="!pending.length" class="admin-muted">{{ $t('admin.noPendingGames') }}</p>

  <div class="admin-games__header">
    <h2>{{ $t('admin.gamesAllTitle') }}</h2>
  </div>

  <div class="admin-games__list">
    <table class="admin-table">
      <thead>
        <tr>
          <th>{{ $t('admin.gameName') }}</th>
          <th>{{ $t('admin.gameSlug') }}</th>
          <th>{{ $t('admin.gameDev') }}</th>
          <th>{{ $t('admin.gameVersion') }}</th>
          <th>{{ $t('admin.gameUiUrl') }}</th>
          <th>{{ $t('admin.gameStatus') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in externalGames" :key="g._id" class="admin-table__row">
          <td>{{ g.name }}</td>
          <td>{{ g._id }}</td>
          <td>{{ g.devAccountId }}</td>
          <td>{{ g.manifest?.version }}</td>
          <td class="admin-games__url">{{ g.uiUrl }}</td>
          <td>
            <span class="admin-tag" :style="{ '--tag-color': statusColors[g.status] || '#9e9e9e' }">
              {{ $t(STATUS_KEYS[g.status] ?? '') || g.status }}
            </span>
          </td>
          <td class="admin-table__actions">
            <UiButton
              v-if="g.status !== 'published'"
              icon="check"
              :loading="moderatingId === g._id"
              @click="catalog.approveGame(g._id)"
            >{{ $t('admin.approve') }}</UiButton>
            <UiButton
              v-if="g.status === 'published'"
              icon="times"
              :loading="moderatingId === g._id"
              @click="catalog.unpublishGame(g._id)"
            >{{ $t('admin.unpublish') }}</UiButton>
          </td>
        </tr>
        <tr v-if="!externalGames.length">
          <td colspan="7" class="admin-muted" style="text-align: center; padding: 2rem">
            {{ $t('admin.noExternalGames') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</template>
