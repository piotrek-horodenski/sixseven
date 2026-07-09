<script setup lang="ts" generic="T">

import { ref, computed, useAttrs } from 'vue'
import { useDropdown } from '@/composables/useDropdown'
import type { ISelectOption } from './controls.model'

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

const props = defineProps<{
  modelValue: T[]
  options: ISelectOption<T>[]
  placeholder?: string
  max?: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: T[]): void
  (event: 'change', value: T[]): void
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
  onSelect: toggleByIndex,
  closeOnSelect: false,
})

const selectedOptions = computed(() =>
  props.options.filter(o => props.modelValue.includes(o.value))
)

const canSelectMore = computed(() =>
  !props.max || props.modelValue.length < props.max
)

const classes = computed(() => ({
  'ui-multiselect--disabled': attrs.disabled,
  'ui-multiselect--open': isOpen.value,
}))

function isSelected(option: ISelectOption<T>): boolean {
  return props.modelValue.includes(option.value)
}

function toggleByIndex(index: number) {
  const option = props.options[index]
  if (!option || option.disabled) return
  toggleOption(option)
}

function toggleOption(option: ISelectOption<T>) {
  if (option.disabled) return

  const selected = isSelected(option)
  let newValue: T[]

  if (selected) {
    newValue = props.modelValue.filter(v => v !== option.value)
  } else {
    if (!canSelectMore.value) return
    newValue = [...props.modelValue, option.value]
  }

  emit('update:modelValue', newValue)
  emit('change', newValue)
}

function removeOption(option: ISelectOption<T>) {
  const newValue = props.modelValue.filter(v => v !== option.value)
  emit('update:modelValue', newValue)
  emit('change', newValue)
}

function selectAll() {
  const allValues = props.options
    .filter(o => !o.disabled)
    .map(o => o.value)
    .slice(0, props.max ?? Infinity)
  emit('update:modelValue', allValues)
  emit('change', allValues)
}

function clearAll() {
  emit('update:modelValue', [])
  emit('change', [])
}

</script>
<template>
<div
  class="ui-multiselect"
  :class="classes"
  ref="containerRef"
>
  <div class="ui-multiselect__label"><slot /></div>
  <button
    type="button"
    class="ui-multiselect__trigger"
    ref="triggerRef"
    v-bind="$attrs"
    aria-haspopup="listbox"
    :aria-expanded="isOpen"
    @click="toggle"
    @keydown="handleKeydown"
  >
    <span v-if="selectedOptions.length === 0" class="ui-multiselect__placeholder">
      {{ placeholder ?? '' }}
    </span>
    <template v-else>
      <span
        v-for="option in selectedOptions"
        :key="String(option.value)"
        class="ui-multiselect__chip"
      >
        <slot name="chip" :option="option" :remove="() => removeOption(option)">
          <span class="ui-multiselect__chip-label">{{ option.label }}</span>
          <span
            class="ui-multiselect__chip-remove"
            @click.stop="removeOption(option)"
          >&times;</span>
        </slot>
      </span>
    </template>
    <fa
      class="ui-multiselect__chevron"
      icon="chevron-down"
    />
  </button>
  <div
    v-show="isOpen"
    ref="dropdownRef"
    class="ui-multiselect__dropdown"
    :style="dropdownStyle"
    role="listbox"
    aria-multiselectable="true"
  >
    <div class="ui-multiselect__actions">
      <a class="ui-multiselect__action" @click.prevent="selectAll">Select all</a>
      <a class="ui-multiselect__action" @click.prevent="clearAll">Clear</a>
    </div>
    <div
      v-for="(option, index) in options"
      :key="index"
      :data-dropdown-index="index"
      class="ui-multiselect__option"
      :class="{
        'ui-multiselect__option--selected': isSelected(option),
        'ui-multiselect__option--highlighted': highlightedIndex === index,
        'ui-multiselect__option--disabled': option.disabled,
      }"
      role="option"
      :aria-selected="isSelected(option)"
      @click="toggleOption(option)"
      @mouseenter="highlightedIndex = index"
    >
      <span class="ui-multiselect__check">
        <fa v-if="isSelected(option)" icon="check" />
      </span>
      <slot name="option" :option="option" :selected="isSelected(option)">
        {{ option.label }}
      </slot>
    </div>
  </div>
</div>
</template>
