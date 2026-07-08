<script setup lang="ts">

import { computed, ref, watch, type Ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  disabled?: boolean
  tabindex?: number
}>(), {
  disabled: false,
  tabindex: -2,
})
const val: Ref<boolean> = ref(props.modelValue)
const checkbox = ref(null)

const emit = defineEmits<{
  (event: 'change', value: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const classes = computed(() => {
  return {
    'ui-switch--disabled': props.disabled,
  }
})

function change() {
  val.value = !val.value
  emit('update:modelValue', val.value)
  emit('change', val.value)
}

watch(() => props.modelValue, (newValue) => {
  if (val.value !== newValue) {
    val.value = newValue
  }
})

</script>
<template>
<label
  class="ui-switch"
  :class="classes"
>
  <input
    type="checkbox"
    ref="checkbox"
    class="ui-switch__checkbox"
    :checked="val"
    :disabled="disabled"
    :tabindex="props.tabindex !== -2 ? props.tabindex : undefined"
    @change="change"
  />
  <span class="ui-switch__slider">
    <span class="ui-switch__slider-bg">
    </span>
  </span>
  <span class="ui-switch__text">
    <slot />
  </span>
</label>
</template>
