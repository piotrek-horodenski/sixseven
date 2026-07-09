<script setup lang="ts" generic="T">

import { ref, computed, watch, useAttrs } from 'vue'

type TRadioValue = string | number | boolean | null | undefined

const props = defineProps<{
  value: TRadioValue
}>()
const attrs = useAttrs()
const modelValue = defineModel<T>();
const isFocusVisible = ref(false)
const input = ref(null)

const emit = defineEmits<{
  (event: 'change', value: TRadioValue): void
}>()

const classes = computed(() => {
  return {
    'ui-radio--disabled': attrs.disabled,
    'ui-radio--selected': modelValue.value === props.value,
    'ui-radio--focus-visible': isFocusVisible.value,
  }
})

function checkFocusVisible() {
  const elementsMatching = document.querySelector('input:focus-visible')

  isFocusVisible.value = elementsMatching === input.value
}

watch(modelValue, (value) => {
  if (value === props.value) {
    emit('change', props.value)
  }
})

</script>
<template>
<label
  class="ui-radio"
  :class="classes"
>
  <input
    type="radio"
    class="ui-radio__input"
    ref="input"
    :value="props.value"
    v-bind="$attrs"
    v-model="modelValue"
    @focus="checkFocusVisible"
    @blur="checkFocusVisible"
  />
  <span class="ui-radio__label"><slot /></span>
</label>
</template>
