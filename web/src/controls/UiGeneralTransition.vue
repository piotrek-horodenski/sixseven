<script setup lang="ts">

import { computed, ref } from 'vue'

import {
  EAnimationType,
  EAnimationWrapperOverflow,
  ETransitionMode,
  type IAnimationInstance
} from './animations.model'
import { DefaultAnimationInstance } from './animations.consts'

const props = withDefaults(defineProps<{
  animationInstance?: IAnimationInstance
  name?: string
}>(), {
  animationInstance: () => DefaultAnimationInstance,
  name: 'default',
})

const wrapper = ref(null)
const isActive = ref(false)
const height = ref(-1)

const classes = computed(() => {
  return {
    'ui-general-transition--active': isActive.value,
    [props.animationInstance.definition.name + '-wrapper-active']: isActive.value,
  }
})
const styles = computed(() => {
  let overflow: string | undefined = undefined

  if (props.animationInstance.definition.wrapperOverflow === EAnimationWrapperOverflow.hidden) {
    overflow = 'hidden'
  }
  if (height.value === -1) {
    return {
      overflow,
    }
  }
  return {
    height: height.value + 'px',
    overflow,
  }
})
const transitionName = computed(() => {
  return props.animationInstance.definition.name
})
const transitionMode = computed(() => {
  return props.animationInstance.definition.mode
})
const transitionDuration = computed(() => {
  return props.animationInstance.definition.duration
})

function animationEnded() {
  isActive.value = false
  height.value = -1
}

function onBeforeEnter() {
  if (props.animationInstance.type === EAnimationType.appearing) {
    height.value = 0
    isActive.value = true
  }
}

function onEnter(element: Element) {
  if (props.animationInstance.definition.mode !== ETransitionMode.inOut) {
    const el = element as HTMLElement
    height.value = el.offsetHeight
  } else {
    if (wrapper.value) {
      height.value = (wrapper.value as HTMLDivElement).offsetHeight
    }
    isActive.value = true
    const el = element as HTMLElement
    const newHeight = el.offsetHeight
    requestAnimationFrame(() => {
      height.value = newHeight
    })
  }
}

function onAfterEnter() {
  if (props.animationInstance.definition.mode !== ETransitionMode.inOut) {
    animationEnded()
  }
}

function onBeforeLeave(element: Element) {
  if (props.animationInstance.definition.mode !== ETransitionMode.inOut) {
    const el = element as HTMLElement

    height.value = el.offsetHeight
    isActive.value = true
  }
}

function onLeave() {
  if (props.animationInstance.type === EAnimationType.disappearing) {
    requestAnimationFrame(() => {
      height.value = 0
    })
  }
}

function onAfterLeave() {
  if (
    props.animationInstance.definition.mode === ETransitionMode.inOut ||
    props.animationInstance.type === EAnimationType.disappearing
  ) {
    animationEnded()
  }
}

</script>
<template>
<div
  class="ui-general-transition"
  :class="classes"
  :style="styles"
  ref="wrapper"
>
  <Transition
    :name="transitionName"
    :mode="transitionMode"
    :duration="transitionDuration"
    :css="true"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @after-enter="onAfterEnter"
    @before-leave="onBeforeLeave"
    @leave="onLeave"
    @after-leave="onAfterLeave"
  >
    <slot />
  </Transition>
</div>
</template>
