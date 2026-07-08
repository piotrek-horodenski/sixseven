<script setup lang="ts">

import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'

const store = useEnginesStore()
const route = useRoute()

const engineId = computed(() => route.params.id as string)

const engine = computed<IEngine | undefined>(() =>
  store.engines.find(e => e._id === engineId.value),
)

const errors = computed(() =>
  [...store.engineErrors].sort((a, b) => b.timestamp - a.timestamp),
)

function timeSince(ts: number): string {
  if (ts <= 0) return '-'
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function clearErrors() {
  store.clearEngineErrors(engineId.value)
}

onMounted(() => {
  store.init()
  store.subscribeErrors(engineId.value)
})

onBeforeUnmount(() => {
  store.unsubscribeErrors()
})

</script>
<template>
<div class="engine-errors">
  <div class="engine-errors__header">
    <h3 v-if="engine"><fa icon="exclamation-circle" /> {{ engine.alias }} - Errors</h3>
    <h3 v-else>Engine not found</h3>
    <UiButton v-if="errors.length" @click="clearErrors" v-tooltip="'<b>Clear</b> all errors'">
      <fa icon="trash" /> Clear
    </UiButton>
  </div>
  <div class="engine-errors__list">
    <div
      v-for="error in errors"
      :key="error._id"
      class="engine-errors__error"
    >
      <div class="engine-errors__time">{{ timeSince(error.timestamp) }}</div>
      <div class="engine-errors__data">{{ error.data }}</div>
    </div>
    <div v-if="!errors.length" class="engine-errors__empty">
      <fa icon="check-circle" />
      <p>No errors recorded</p>
    </div>
  </div>
</div>
</template>
