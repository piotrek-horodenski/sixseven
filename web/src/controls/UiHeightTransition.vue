<script setup lang="ts">

import { computed, ref } from 'vue'

import { EStickTo } from './controls.model'

const props = withDefaults(defineProps<{
  stickTo?: EStickTo
}>(), {
  stickTo: EStickTo.bottom,
})

const wrapper = ref(null)
const isActive = ref(false)
const height = ref(-1)

const classes = computed(() => {
  return {
    'ui-height-transition--active': isActive.value,
  }
})
const styles = computed(() => {
  if (height.value === -1) {
    return {}
  }
  return {
    height: height.value + 'px',
  }
})
const transitionName = computed(() => {
  if (props.stickTo === EStickTo.top) {
    return 'height-transition-top'
  }
  return 'height-transition'
})

function onBeforeEnter() {
  if (wrapper.value) {
    const el = wrapper.value as HTMLElement

    height.value = el.getBoundingClientRect().height
  } else {
    height.value = 0
  }
}

function onEnter(element: Element) {
  const el = element as HTMLElement
  const rect = el.getBoundingClientRect()

  isActive.value = true
  height.value = rect.height
}

function onBeforeLeave(element: Element) {
  const el = element as HTMLElement
  const rect = el.getBoundingClientRect()

  height.value = rect.height
}

async function onLeave() {
  isActive.value = true
  requestAnimationFrame(() => {
    height.value = 0
  })
}

function resetWrapper() {
  isActive.value = false
  height.value = -1
}

</script>
<template>
<div
  class="ui-height-transition"
  :class="classes"
  :style="styles"
  ref="wrapper"
>
  <Transition
    :name="transitionName"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @after-enter="resetWrapper"
    @before-leave="onBeforeLeave"
    @leave="onLeave"
    @after-leave="resetWrapper"
  >
    <slot />
  </Transition>
</div>
</template>
