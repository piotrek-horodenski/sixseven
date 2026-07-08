<script setup lang="ts">

import { ref, computed } from 'vue'
import type { IEngine } from '@/stores/engines/engines.model'
import { ENGINE_STATUS_NEW, ENGINE_STATUS_ACTIVE, ENGINE_STATUS_INACTIVE } from '@/stores/engines/engines.model'

const props = defineProps<{
  engine: IEngine
}>()

const emit = defineEmits<{
  (event: 'select', engine: IEngine): void
  (event: 'edit', engine: IEngine): void
  (event: 'delete', engine: IEngine): void
  (event: 'wakeUp', engine: IEngine): void
  (event: 'unlock', engine: IEngine): void
  (event: 'showLogs', engine: IEngine): void
  (event: 'showErrors', engine: IEngine): void
}>()

const showMenu = ref(false)

const statusClass = computed(() => {
  if (props.engine.status === ENGINE_STATUS_ACTIVE && props.engine.info?.status) {
    return 'engine-card__status--' + props.engine.info.status.toLowerCase()
  }
  switch (props.engine.status) {
    case ENGINE_STATUS_ACTIVE: return 'engine-card__status--active'
    case ENGINE_STATUS_INACTIVE: return 'engine-card__status--inactive'
    default: return 'engine-card__status--new'
  }
})

const statusLabel = computed(() => {
  if (props.engine.status === ENGINE_STATUS_ACTIVE && props.engine.info?.status) {
    return props.engine.info.status
  }
  switch (props.engine.status) {
    case ENGINE_STATUS_ACTIVE: return 'Active'
    case ENGINE_STATUS_INACTIVE: return 'Inactive'
    default: return 'New'
  }
})

const infoStatusClass = computed(() => {
  if (props.engine.status === ENGINE_STATUS_ACTIVE && props.engine.info?.status) {
    return 'engine-card__info-status--' + props.engine.info.status.toLowerCase()
  }
  switch (props.engine.status) {
    case ENGINE_STATUS_ACTIVE: return 'engine-card__info-status--ok'
    case ENGINE_STATUS_INACTIVE: return 'engine-card__info-status--inactive'
    default: return 'engine-card__info-status--new'
  }
})

function timeSince(ts: number): string {
  if (ts <= 0) return '-'
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function menuAction(action: string) {
  showMenu.value = false
  switch (action) {
    case 'wakeUp': emit('wakeUp', props.engine); break
    case 'logs': emit('showLogs', props.engine); break
    case 'errors': emit('showErrors', props.engine); break
    case 'unlock': emit('unlock', props.engine); break
    case 'edit': emit('edit', props.engine); break
    case 'delete': emit('delete', props.engine); break
  }
}

</script>
<template>
<div class="engine-card" @click="emit('select', engine)">
  <div class="engine-card__status" :class="statusClass"></div>
  <div class="engine-card__info">
    <div class="engine-card__alias">
      <span v-if="engine.locked" class="engine-card__lock"><fa icon="lock" /></span>
      {{ engine.alias }}
    </div>
    <div class="engine-card__address">{{ engine.address }}:{{ engine.port }}</div>
    <div class="engine-card__address">{{ engine.address }}:{{ engine.rePort }}</div>
  </div>
  <div class="engine-card__details">
    <span class="engine-card__detail">Cam: {{ engine.cameraNumber || '-' }}</span>
    <span class="engine-card__detail engine-card__info-status" :class="infoStatusClass">{{ statusLabel }}</span>
    <span v-if="engine.assignedProject" class="engine-card__detail">
      <fa icon="project-diagram" /> {{ engine.assignedProject }}
    </span>
  </div>
  <div class="engine-card__meta">
    <span v-if="engine.since > 0">Since: {{ timeSince(engine.since) }}</span>
    <span v-if="engine.lastAttempt > 0">Last: {{ timeSince(engine.lastAttempt) }}</span>
  </div>
  <div class="engine-card__actions" @click.stop>
    <div class="engine-card__menu-wrapper">
      <UiButton @click="toggleMenu" v-tooltip="'<b>Actions</b>'">
        <fa icon="ellipsis-v" />
      </UiButton>
      <div v-if="showMenu" class="engine-card__dropdown" @click.stop>
        <a href="#" @click.prevent="menuAction('wakeUp')"><fa icon="sun" /> Wake up</a>
        <a href="#" @click.prevent="menuAction('logs')"><fa icon="clipboard-list" /> Show logs</a>
        <a href="#" @click.prevent="menuAction('errors')"><fa icon="exclamation-circle" /> Show errors</a>
        <a v-if="engine.locked && !engine.assignedProject" href="#" @click.prevent="menuAction('unlock')"><fa icon="unlock" /> Unlock engine</a>
        <a href="#" @click.prevent="menuAction('edit')"><fa icon="edit" /> Edit</a>
        <a href="#" @click.prevent="menuAction('delete')"><fa icon="trash" /> Delete</a>
      </div>
    </div>
  </div>
</div>
</template>
