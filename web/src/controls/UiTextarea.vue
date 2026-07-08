<script setup lang="ts">

import { ref, computed, onMounted, useAttrs, watch } from 'vue'

import {
  textareaMinHeight,
  textareaMaxHeight,
  textareaBottomMargin,
} from './controls.consts'

defineOptions({
  inheritAttrs: false
})
const props = withDefaults(defineProps<{
  modelValue: string
  maxHeight?: number
  autoHeight?: boolean
}>(), {
  maxHeight: textareaMaxHeight,
  autoHeight: true,
})
const emit = defineEmits([
  'update:modelValue',
])
const attrs = useAttrs()
const textarea = ref(null)
const curHeight = ref(0)

const classes = computed(() => {
  return {
    'ui-textarea--disabled': attrs.disabled,
  }
})

const styles = computed(() => {
  if (!props.autoHeight) {
    return {}
  }
  return {
    height: `${curHeight.value}px`
  }
})

function onInput($event: Event) {
  const value = ($event.target as HTMLTextAreaElement).value
  emit('update:modelValue', value)
}

function adjustHeight(value: string) {
  if (!props.autoHeight || !textarea.value) {
    return
  }
  const textArea = document.querySelector('#proto-textarea') as HTMLTextAreaElement
  const width = (textarea.value as HTMLTextAreaElement).offsetWidth

  textArea.style.width = width + 'px'
  textArea.innerHTML = value
  curHeight.value = Math.max(
    textareaMinHeight,
    Math.min(
      textArea.scrollHeight + textareaBottomMargin,
      props.maxHeight
    )
  )
}

watch(() => props.modelValue, (value) => {
  adjustHeight(value)
})

onMounted(() => {
  adjustHeight(props.modelValue)
})

</script>
<template>
<label
  class="ui-textarea"
  :class="classes"
>
  <div class="ui-textarea__label"><slot /></div>
  <textarea
    :value="modelValue"
    ref="textarea"
    class="ui-textarea__textarea"
    v-bind="$attrs"
    :style="styles"
    @input="onInput"
  ></textarea>
</label>
</template>
