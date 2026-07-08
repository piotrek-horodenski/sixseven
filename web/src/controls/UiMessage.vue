<script setup lang="ts">

import { computed } from 'vue'

import { EMessageType } from './controls.model'

const props = withDefaults(defineProps<{
  type?: EMessageType
  showIcon?: boolean
  closable?: boolean
}>(), {
  type: EMessageType.info,
  showIcon: true,
  closable: false,
})
const emit = defineEmits<{
  (event: 'close'): void
}>()

const iconByTypes: {
  [key in EMessageType]: string
} = {
  [EMessageType.success]: 'check-circle',
  [EMessageType.info]: 'info-circle',
  [EMessageType.warning]: 'exclamation-triangle',
  [EMessageType.error]: 'times-circle',
}

const classes = computed(() => {
  return 'ui-message__' + props.type
})

const iconByType = computed(() => {
  return iconByTypes[props.type]
})

function close() {
  emit('close')
}

</script>
<template>
<div
  class="ui-message"
  :class="classes"
>
  <div
    v-if="$slots.title"
    class="ui-message__title"
  >
    <fa
      v-if="showIcon"
      :icon="iconByType"
      class="ui-message__icon"
    />
    <a
      v-if="closable"
      href="///"
      class="ui-message__close"
      tabindex="0"
      @click.prevent="close"
    >
      <fa icon="times" />
    </a>
    <slot name="title" />
  </div>
  <fa
    v-if="!$slots.title && showIcon"
    :icon="iconByType"
    class="ui-message__icon"
  />
  <a
    v-if="!$slots.title && closable"
    href="///"
    class="ui-message__close"
    @click.prevent="close"
  >
    <fa icon="times" />
  </a>
  <slot />
</div>
</template>
