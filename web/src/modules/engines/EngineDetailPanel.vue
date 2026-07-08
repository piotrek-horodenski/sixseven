<script setup lang="ts">

import { ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'
import { ENGINE_STATUS_NEW, ENGINE_STATUS_ACTIVE, ENGINE_STATUS_INACTIVE } from '@/stores/engines/engines.model'

const store = useEnginesStore()
const route = useRoute()
const router = useRouter()

const engine = ref<IEngine | null>(null)

watch(() => route.params.id, (id) => {
  if (!id) { engine.value = null; return }
  engine.value = store.engines.find(e => e._id === id) || null
}, { immediate: true })

watch(() => store.engines, () => {
  const id = route.params.id as string
  if (id) engine.value = store.engines.find(e => e._id === id) || null
}, { deep: true })

const statusClass = computed(() => {
  if (!engine.value) return ''
  if (engine.value.status === ENGINE_STATUS_ACTIVE && engine.value.info?.status) {
    return 'engine-detail__status-dot--' + engine.value.info.status.toLowerCase()
  }
  switch (engine.value.status) {
    case ENGINE_STATUS_ACTIVE: return 'engine-detail__status-dot--active'
    case ENGINE_STATUS_INACTIVE: return 'engine-detail__status-dot--inactive'
    default: return 'engine-detail__status-dot--new'
  }
})

const statusLabel = computed(() => {
  if (!engine.value) return ''
  if (engine.value.status === ENGINE_STATUS_ACTIVE && engine.value.info?.status) {
    return engine.value.info.status
  }
  switch (engine.value.status) {
    case ENGINE_STATUS_ACTIVE: return 'Active'
    case ENGINE_STATUS_INACTIVE: return 'Inactive'
    default: return 'New'
  }
})

const infoStatusClass = computed(() => {
  if (!engine.value) return ''
  if (engine.value.status === ENGINE_STATUS_ACTIVE && engine.value.info?.status) {
    return 'engine-detail__info-status--' + engine.value.info.status.toLowerCase()
  }
  switch (engine.value.status) {
    case ENGINE_STATUS_ACTIVE: return 'engine-detail__info-status--ok'
    case ENGINE_STATUS_INACTIVE: return 'engine-detail__info-status--inactive'
    default: return 'engine-detail__info-status--new'
  }
})

function formatTime(ts: number): string {
  if (ts <= 0) return '-'
  return new Date(ts).toLocaleString()
}

function timeSince(ts: number): string {
  if (ts <= 0) return '-'
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const memberClusters = computed(() => {
  if (!engine.value) return []
  return store.clusters.filter(c => c.engines.includes(engine.value!._id))
})

const canUnlock = computed(() => {
  if (!engine.value) return false
  return engine.value.locked && !engine.value.assignedProject
})

function close() {
  router.push('/engines/list')
}

function wakeUp() {
  if (engine.value) store.wakeUpEngine(engine.value._id)
}

function unlock() {
  if (engine.value) store.unlockEngine(engine.value._id)
}

function openLogs() {
  if (!engine.value) return
  const resolved = router.resolve({ name: 'engine-logs', params: { id: engine.value._id } })
  window.open(resolved.href, '_blank')
}

function openErrors() {
  if (!engine.value) return
  const resolved = router.resolve({ name: 'engine-errors', params: { id: engine.value._id } })
  window.open(resolved.href, '_blank')
}

</script>
<template>
<div class="engine-detail" v-if="engine">
  <div class="engine-detail__header">
    <h3>{{ engine.alias }}</h3>
    <a href="#" @click.prevent="close"><fa icon="times" /></a>
  </div>

  <div class="engine-detail__status-row">
    <span class="engine-detail__status-dot" :class="statusClass"></span>
    <span class="engine-detail__status-label" :class="infoStatusClass">{{ statusLabel }}</span>
    <span v-if="engine.locked" class="engine-detail__locked"><fa icon="lock" /> Locked</span>
  </div>

  <table class="engine-detail__table">
    <tbody>
    <tr>
      <td>Address</td>
      <td>{{ engine.address }}</td>
    </tr>
    <tr>
      <td>Guard Port</td>
      <td>{{ engine.port }}</td>
    </tr>
    <tr>
      <td>RE Port</td>
      <td>{{ engine.rePort }}</td>
    </tr>
    <tr>
      <td>Camera</td>
      <td>{{ engine.cameraNumber || 'No preference' }}</td>
    </tr>
    <tr>
      <td>Status Since</td>
      <td>{{ timeSince(engine.since) }}</td>
    </tr>
    <tr>
      <td>Last Check</td>
      <td>{{ timeSince(engine.lastAttempt) }}</td>
    </tr>
    <tr>
      <td>Assigned Project</td>
      <td>{{ engine.assignedProject || '-' }}</td>
    </tr>
    <tr v-if="engine.info?.project?.id">
      <td>Reported Project</td>
      <td>{{ engine.info.project.id }}</td>
    </tr>
    <tr>
      <td>Initialized</td>
      <td>{{ engine.initialized ? 'Yes' : 'No' }}</td>
    </tr>
    <tr v-if="engine.errorCount">
      <td>Error Count</td>
      <td>{{ engine.errorCount }}</td>
    </tr>
    <tr>
      <td>Clusters</td>
      <td>
        <template v-if="memberClusters.length">
          <RouterLink
            v-for="cluster in memberClusters"
            :key="cluster._id"
            :to="'/engines/clusters'"
            class="engine-detail__cluster-tag"
          >{{ cluster.alias }}</RouterLink>
        </template>
        <span v-else>-</span>
      </td>
    </tr>
    </tbody>
  </table>

  <div class="engine-detail__actions">
    <UiButton @click="wakeUp" v-tooltip="'<b>Wake up</b> engine'">
      <fa icon="sun" /> Wake Up
    </UiButton>
    <UiButton v-if="canUnlock" @click="unlock" v-tooltip="'<b>Unlock</b> engine'">
      <fa icon="unlock" /> Unlock
    </UiButton>
    <UiButton @click="openLogs" v-tooltip="'Open <b>logs</b> in new tab'">
      <fa icon="clipboard-list" /> Logs
    </UiButton>
    <UiButton @click="openErrors" v-tooltip="'Open <b>errors</b> in new tab'">
      <fa icon="exclamation-circle" /> Errors
    </UiButton>
  </div>
</div>
</template>
