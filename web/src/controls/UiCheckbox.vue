<script setup lang="ts">

import { ref, computed, useAttrs } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  indeterminate?: boolean
}>(), {
  indeterminate: false,
})
const attrs = useAttrs()
const isFocusVisible = ref(false)
const input = ref(null)

const emit = defineEmits<{
  (event: 'change', value: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const value = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

const classes = computed(() => {
  return {
    'ui-checkbox--disabled': attrs.disabled,
    'ui-checkbox--checked': value.value && !props.indeterminate,
    'ui-checkbox--indeterminate': props.indeterminate,
    'ui-checkbox--focus-visible': isFocusVisible.value,
  }
})

function checkFocusVisible() {
  const elementsMatching = document.querySelector('input:focus-visible')

  isFocusVisible.value = elementsMatching === input.value
}

</script>
<template>
<label
  class="ui-checkbox"
  :class="classes"
>
  <fa v-if="indeterminate" icon="minus" />
  <fa v-else icon="check" />
  <input
    v-model="value"
    type="checkbox"
    class="ui-checkbox__input"
    ref="input"
    v-bind="$attrs"
    @focus="checkFocusVisible"
    @blur="checkFocusVisible"
  />
  <span class="ui-checkbox__label"><slot /></span>
</label>
</template>
