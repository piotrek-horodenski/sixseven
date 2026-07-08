<script setup lang="ts">

import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { ICluster, IEngine } from '@/stores/engines/engines.model'
import { ENGINE_STATUS_ACTIVE, ENGINE_STATUS_INACTIVE, ENGINE_STATUS_NEW } from '@/stores/engines/engines.model'

const props = defineProps<{
  cluster: ICluster
}>()

const emit = defineEmits<{
  (event: 'edit', cluster: ICluster): void
  (event: 'delete', cluster: ICluster): void
}>()

const store = useEnginesStore()
const route = useRoute()
const router = useRouter()
const expanded = ref(false)

const isSelected = computed(() => route.params.id === props.cluster._id)

function selectCluster() {
  if (isSelected.value) {
    router.push('/engines/clusters')
  } else {
    router.push(`/engines/clusters/${props.cluster._id}`)
  }
  expanded.value = true
}

const memberEngines = computed(() => store.getClusterEngines(props.cluster._id))

const availableEngines = computed(() => store.getUnclusteredEngines(props.cluster._id))

const statusClass = computed(() => {
  if (!memberEngines.value.length) return 'cluster-card__status--new'
  const allActive = memberEngines.value.every(e => e.status === ENGINE_STATUS_ACTIVE)
  const allInactive = memberEngines.value.every(e => e.status === ENGINE_STATUS_INACTIVE)
  if (allActive) return 'cluster-card__status--active'
  if (allInactive) return 'cluster-card__status--inactive'
  return 'cluster-card__status--warning'
})

function addEngine(engineId: string) {
  store.updateCluster({
    _id: props.cluster._id,
    engines: [...props.cluster.engines, engineId],
  })
}

function removeEngine(engineId: string) {
  store.updateCluster({
    _id: props.cluster._id,
    engines: props.cluster.engines.filter(id => id !== engineId),
  })
}

function statusColor(engine: IEngine): string {
  if (engine.status === ENGINE_STATUS_ACTIVE) {
    const s = (engine.info?.status || 'Ok').toLowerCase()
    if (['ok', 'busy', 'active'].includes(s)) return '#4caf50'
    if (['idle', 'deploying', 'multiplerunning'].includes(s)) return '#ff9800'
    if (s === 'starting') return '#e65100'
    return '#f44336'
  }
  if (engine.status === ENGINE_STATUS_INACTIVE) return '#f44336'
  return '#ff9800'
}

function engineTooltip(engine: IEngine): string {
  const status = engine.status === ENGINE_STATUS_ACTIVE
    ? (engine.info?.status || 'Active')
    : engine.status === ENGINE_STATUS_INACTIVE ? 'Inactive' : 'New'
  const color = statusColor(engine)
  const lines = [
    `<b>Status:</b> <span style="color:${color};font-weight:600">${status}</span>`,
    `<b>Since:</b> ${timeSince(engine.since)}`,
    `<b>Last Check:</b> ${timeSince(engine.lastAttempt)}`,
  ]
  if (engine.assignedProject) lines.push(`<b>Project:</b> ${engine.assignedProject}`)
  if (engine.info?.project?.id) lines.push(`<b>Reported Project:</b> ${engine.info.project.id}`)
  if (engine.locked) lines.push('<b>Locked</b>')
  if (engine.errorCount) lines.push(`<b>Errors:</b> ${engine.errorCount}`)
  return lines.join('<br>')
}

function timeSince(ts: number): string {
  if (ts <= 0) return '-'
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function moveEngine(index: number, direction: number) {
  const arr = [...props.cluster.engines]
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= arr.length) return
  ;[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]]
  store.updateCluster({ _id: props.cluster._id, engines: arr })
}

</script>
<template>
<div class="cluster-card">
  <div class="cluster-card__header" :class="{ 'cluster-card__header--selected': isSelected }" @click="selectCluster">
    <div class="cluster-card__status" :class="statusClass"></div>
    <div class="cluster-card__alias">{{ cluster.alias }}</div>
    <span class="cluster-card__count">{{ memberEngines.length }} engine{{ memberEngines.length !== 1 ? 's' : '' }}</span>
    <fa :icon="expanded ? 'caret-up' : 'caret-down'" class="cluster-card__toggle" />
    <div class="cluster-card__actions" @click.stop>
      <UiButton @click="emit('edit', cluster)" v-tooltip="'<b>Edit</b> cluster'">
        <fa icon="edit" />
      </UiButton>
      <UiButton @click="emit('delete', cluster)" v-tooltip="'<b>Delete</b> cluster'">
        <fa icon="trash" />
      </UiButton>
    </div>
  </div>

  <div v-if="expanded" class="cluster-card__body">
    <div class="cluster-card__engines">
      <div
        v-for="(engine, index) in memberEngines"
        :key="engine._id"
        class="cluster-card__engine"
        v-tooltip="engineTooltip(engine)"
      >
        <span class="engine-card__status"
          :class="{
            'engine-card__status--active': engine.status === 1,
            'engine-card__status--inactive': engine.status === 2,
            'engine-card__status--new': engine.status === 0,
          }"
        ></span>
        <span class="cluster-card__engine-alias">{{ engine.alias }}</span>
        <span class="cluster-card__engine-address">{{ engine.address }}:{{ engine.port }}</span>
        <div class="cluster-card__engine-actions">
          <UiButton :disabled="index === 0" @click="moveEngine(index, -1)" v-tooltip="'Move <b>up</b>'">
            <fa icon="arrow-up" />
          </UiButton>
          <UiButton :disabled="index === memberEngines.length - 1" @click="moveEngine(index, 1)" v-tooltip="'Move <b>down</b>'">
            <fa icon="arrow-down" />
          </UiButton>
          <UiButton @click="removeEngine(engine._id)" v-tooltip="'<b>Remove</b> from cluster'">
            <fa icon="times" />
          </UiButton>
        </div>
      </div>
      <div v-if="!memberEngines.length" class="cluster-card__empty">
        No engines in this cluster
      </div>
    </div>

    <div v-if="availableEngines.length" class="cluster-card__add">
      <select @change="addEngine(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
        <option value="" disabled selected>Add engine...</option>
        <option v-for="engine in availableEngines" :key="engine._id" :value="engine._id">
          {{ engine.alias }} ({{ engine.address }})
        </option>
      </select>
    </div>
  </div>
</div>
</template>
