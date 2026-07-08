<script setup lang="ts">

import { ref, computed, useAttrs } from 'vue'
import { useDropdown } from '@/composables/useDropdown'
import type { ISelectOption } from './controls.model'

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: ISelectOption<string>[]
  placeholder?: string
  freeText?: boolean
}>(), {
  freeText: true,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
  (event: 'change', value: string[]): void
}>()

const searchQuery = ref('')
const containerRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

const filteredOptions = computed(() => {
  const selected = new Set(props.modelValue)
  const available = props.options.filter(o => !selected.has(o.value))
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return available
  return available.filter(o => o.label.toLowerCase().includes(query))
})

const optionCount = computed(() => filteredOptions.value.length)

const { isOpen, highlightedIndex, dropdownStyle, open, close, handleKeydown: baseHandleKeydown } = useDropdown({
  containerRef,
  triggerRef: inputRef,
  dropdownRef,
  optionCount,
  onSelect: selectByIndex,
  closeOnSelect: false,
  onClose: () => { searchQuery.value = '' },
})

const selectedChips = computed(() =>
  props.modelValue.map(value => {
    const option = props.options.find(o => o.value === value)
    return { value, label: option?.label ?? value }
  })
)

const classes = computed(() => ({
  'ui-chip-input--disabled': attrs.disabled,
  'ui-chip-input--open': isOpen.value,
}))

function selectByIndex(index: number) {
  const option = filteredOptions.value[index]
  if (!option || option.disabled) return
  addTag(option.value)
}

function addTag(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  if (props.modelValue.includes(trimmed)) return
  emit('update:modelValue', [...props.modelValue, trimmed])
  emit('change', [...props.modelValue, trimmed])
  searchQuery.value = ''
  highlightedIndex.value = -1
}

function removeTag(value: string) {
  const next = props.modelValue.filter(v => v !== value)
  emit('update:modelValue', next)
  emit('change', next)
  inputRef.value?.focus()
}

function onInput(event: Event) {
  searchQuery.value = (event.target as HTMLInputElement).value
  if (!isOpen.value) open()
  highlightedIndex.value = -1
}

function onFocus() {
  if (!isOpen.value) open()
}

function focusInput() {
  inputRef.value?.focus()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (isOpen.value && highlightedIndex.value >= 0) {
      selectByIndex(highlightedIndex.value)
    } else if (searchQuery.value.trim() && props.freeText) {
      addTag(searchQuery.value.trim())
    }
    return
  }
  if (event.key === ' ' && searchQuery.value.trim() && props.freeText) {
    event.preventDefault()
    addTag(searchQuery.value.trim())
    return
  }
  if (event.key === 'Backspace' && !searchQuery.value && props.modelValue.length > 0) {
    removeTag(props.modelValue[props.modelValue.length - 1])
    return
  }
  // Let Space through when input is empty (no-op), skip useDropdown for Space
  if (event.key === ' ') return
  baseHandleKeydown(event)
}

</script>
<template>
<div
  class="ui-chip-input"
  :class="classes"
  ref="containerRef"
>
  <div class="ui-chip-input__label"><slot /></div>
  <div class="ui-chip-input__trigger" @click="focusInput">
    <span
      v-for="tag in selectedChips"
      :key="tag.value"
      class="ui-chip-input__chip"
    >
      <span class="ui-chip-input__chip-label">{{ tag.label }}</span>
      <span class="ui-chip-input__chip-remove" @click.stop="removeTag(tag.value)">&times;</span>
    </span>
    <input
      ref="inputRef"
      class="ui-chip-input__input"
      :value="searchQuery"
      :placeholder="modelValue.length === 0 ? placeholder : ''"
      v-bind="$attrs"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      @input="onInput"
      @focus="onFocus"
      @keydown="handleKeydown"
    />
  </div>
  <div
    v-show="isOpen && filteredOptions.length > 0"
    ref="dropdownRef"
    class="ui-chip-input__dropdown"
    :style="dropdownStyle"
    role="listbox"
  >
    <div
      v-for="(option, index) in filteredOptions"
      :key="index"
      :data-dropdown-index="index"
      class="ui-chip-input__option"
      :class="{
        'ui-chip-input__option--highlighted': highlightedIndex === index,
        'ui-chip-input__option--disabled': option.disabled,
      }"
      role="option"
      @click="addTag(option.value)"
      @mouseenter="highlightedIndex = index"
    >
      {{ option.label }}
    </div>
  </div>
</div>
</template>
