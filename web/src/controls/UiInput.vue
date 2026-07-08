<script setup lang="ts">

import { computed, useAttrs } from 'vue'

const attrs = useAttrs()

defineOptions({
  inheritAttrs: false
})
const props = defineProps<{
  modelValue: string
}>()
const emit = defineEmits([
  'update:modelValue',
])

const classes = computed(() => {
  return {
    'ui-input--disabled': attrs.disabled,
  }
})

</script>
<template>
<label
  class="ui-input"
  :class="classes"
>
  <div class="ui-input__label"><slot /></div>
  <input
    :value="props.modelValue"
    class="ui-input__input"
    v-bind="$attrs"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</label>
</template>
