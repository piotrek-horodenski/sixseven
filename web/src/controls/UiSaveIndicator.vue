<script setup lang="ts">

import { ref, watch } from 'vue'

import { ELoaderSize, ELoaderSpeed } from './controls.model'

const props = withDefaults(defineProps<{
  saving?: boolean
  saved?: boolean
  duration?: number
}>(), {
  saving: false,
  saved: false,
  duration: 2000,
})

const showSaved = ref(false)
let timeout: ReturnType<typeof setTimeout> | null = null

watch(() => props.saved, (val) => {
  if (val) {
    showSaved.value = true
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      showSaved.value = false
    }, props.duration)
  }
})

</script>
<template>
<span class="ui-save-indicator">
  <UiLoader
    v-if="saving"
    :size="ELoaderSize.tiny"
    :speed="ELoaderSpeed.fast"
  />
  <span v-else-if="showSaved" class="ui-save-indicator__saved">
    <fa icon="check" />
  </span>
</span>
</template>
