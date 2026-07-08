<script setup lang="ts">

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'

const store = useEnginesStore()
const route = useRoute()

const container = ref<HTMLElement | null>(null)
const end = ref<HTMLElement | null>(null)
const isAtBottom = ref(true)
let pollTimeout: ReturnType<typeof setTimeout> | null = null

const engine = computed<IEngine | undefined>(() =>
  store.engines.find(e => e._id === route.params.id),
)

const logs = computed(() => {
  const engineLogs = engine.value?.logs
  if (!engineLogs?.log) return ''
  return engineLogs.log.split('\r').join('\r\n')
})

function scrollDown() {
  if (!isAtBottom.value || !end.value) return
  end.value.scrollIntoView({ behavior: 'smooth' })
}

function onScroll() {
  if (!container.value) return
  const diff = container.value.scrollTop - container.value.scrollHeight + container.value.offsetHeight
  isAtBottom.value = Math.abs(diff) < 15
}

function pollLogs() {
  if (engine.value) {
    store.showLogs(engine.value._id)
  }
  pollTimeout = setTimeout(pollLogs, 10000)
}

watch(logs, () => {
  nextTick(scrollDown)
}, { immediate: true })

onMounted(() => {
  store.init()
  setTimeout(pollLogs, 500)
})

onBeforeUnmount(() => {
  if (pollTimeout) clearTimeout(pollTimeout)
})

</script>
<template>
<div class="engine-logs">
  <div class="engine-logs__header">
    <h3 v-if="engine"><fa icon="clipboard-list" /> {{ engine.alias }} - Logs</h3>
    <h3 v-else>Engine not found</h3>
    <span v-if="engine?.loadingLogs" class="engine-logs__loading">
      <fa icon="spinner" spin /> Loading...
    </span>
  </div>
  <div
    class="engine-logs__content"
    ref="container"
    @scroll="onScroll"
  >{{ logs }}<span ref="end">&nbsp;</span></div>
</div>
</template>
