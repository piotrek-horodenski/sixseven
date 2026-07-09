<script setup lang="ts" generic="T">

import { ref, computed, useAttrs } from 'vue'
import { useDropdown } from '@/composables/useDropdown'
import type { ISelectOption } from './controls.model'

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

const props = defineProps<{
  modelValue: T | null
  options: ISelectOption<T>[]
  placeholder?: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: T | null): void
  (event: 'change', value: T | null): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const optionCount = computed(() => props.options.length)

const { isOpen, highlightedIndex, dropdownStyle, toggle, handleKeydown } = useDropdown({
  containerRef,
  triggerRef,
  dropdownRef,
  optionCount,
  onSelect: selectByIndex,
  closeOnSelect: true,
})

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue) ?? null
)

const classes = computed(() => ({
  'ui-select--disabled': attrs.disabled,
  'ui-select--open': isOpen.value,
}))

function selectByIndex(index: number) {
  const option = props.options[index]
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

function selectOption(option: ISelectOption<T>) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  isOpen.value = false
  triggerRef.value?.focus()
}

</script>
<template>
<label
  class="ui-select"
  :class="classes"
  ref="containerRef"
>
  <div class="ui-select__label"><slot /></div>
  <button
    type="button"
    class="ui-select__trigger"
    ref="triggerRef"
    v-bind="$attrs"
    aria-haspopup="listbox"
    :aria-expanded="isOpen"
    @click="toggle"
    @keydown="handleKeydown"
  >
    <span v-if="selectedOption" class="ui-select__value">
      <slot name="selected" :option="selectedOption">
        {{ selectedOption.label }}
      </slot>
    </span>
    <span v-else class="ui-select__placeholder">
      {{ placeholder ?? '' }}
    </span>
    <fa
      class="ui-select__chevron"
      icon="chevron-down"
    />
  </button>
  <div
    v-show="isOpen"
    ref="dropdownRef"
    class="ui-select__dropdown"
    :style="dropdownStyle"
    role="listbox"
  >
    <div
      v-for="(option, index) in options"
      :key="index"
      :data-dropdown-index="index"
      class="ui-select__option"
      :class="{
        'ui-select__option--selected': option.value === modelValue,
        'ui-select__option--highlighted': highlightedIndex === index,
        'ui-select__option--disabled': option.disabled,
      }"
      role="option"
      :aria-selected="option.value === modelValue"
      @click="selectOption(option)"
      @mouseenter="highlightedIndex = index"
    >
      <slot name="option" :option="option" :selected="option.value === modelValue">
        {{ option.label }}
      </slot>
    </div>
  </div>
</label>
</template>
