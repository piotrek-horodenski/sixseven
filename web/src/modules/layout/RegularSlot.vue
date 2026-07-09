<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useLayoutStore } from '@/stores/layout/layout.store'

const props = withDefaults(defineProps<{
  name?: string
}>(), {
  name: 'default',
})

const { slots } = storeToRefs(useLayoutStore())

const currentSlot = computed(() => {
  return slots.value.find(slot => slot.name === props.name)
})

const instance = computed(() => {
  return currentSlot.value?.animationInstance
})

</script>
<template>
<UiGeneralTransition
  :animation-instance="instance"
  :name="name"
>
  <slot />
</UiGeneralTransition>
</template>
