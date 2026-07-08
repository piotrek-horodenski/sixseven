<script setup lang="ts">

import { computed } from 'vue'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'
import { ENGINE_STATUS_ACTIVE, ENGINE_STATUS_INACTIVE } from '@/stores/engines/engines.model'

const store = useEnginesStore()

const engines = computed(() =>
  [...store.engines].sort((a, b) => a.alias.localeCompare(b.alias)),
)

function statusClass(status: number) {
  switch (status) {
    case ENGINE_STATUS_ACTIVE: return 'engine-card__status--active'
    case ENGINE_STATUS_INACTIVE: return 'engine-card__status--inactive'
    default: return 'engine-card__status--new'
  }
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

</script>
<template>
<div class="engines-sidebar">
  <div class="engines-sidebar__header">
    <h3>Engines</h3>
  </div>
  <ul class="engines-sidebar__list">
    <li
      v-for="engine in engines"
      :key="engine._id"
      class="engines-sidebar__item"
      v-tooltip="engineTooltip(engine)"
    >
      <span class="engine-card__status" :class="statusClass(engine.status)"></span>
      <div class="engines-sidebar__info">
        <span class="engines-sidebar__alias">{{ engine.alias }}</span>
        <span class="engines-sidebar__address">{{ engine.address }}:{{ engine.port }}</span>
      </div>
    </li>
    <li v-if="!engines.length" class="engines-sidebar__empty">
      No engines registered
    </li>
  </ul>
</div>
</template>
