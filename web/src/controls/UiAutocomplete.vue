<script setup lang="ts" generic="T">

import { ref, computed, watch, useAttrs } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useDropdown } from '@/composables/useDropdown'
import type { ISelectOption } from './controls.model'

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  modelValue: T | null
  options: ISelectOption<T>[]
  placeholder?: string
  freeText?: boolean
  loading?: boolean
  debounce?: number
  filterFn?: (query: string, option: ISelectOption<T>) => boolean
}>(), {
  freeText: false,
  loading: false,
  debounce: 300,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: T | null): void
  (event: 'change', value: T | null): void
  (event: 'search', query: string): void
}>()

const searchQuery = ref('')
const containerRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return props.options

  const filterFn = props.filterFn ?? defaultFilter
  return props.options.filter(o => filterFn(query, o))
})

const optionCount = computed(() => filteredOptions.value.length)

const { isOpen, highlightedIndex, dropdownStyle, open, close, handleKeydown: baseHandleKeydown } = useDropdown({
  containerRef,
  triggerRef: inputRef,
  dropdownRef,
  optionCount,
  onSelect: selectByIndex,
  closeOnSelect: true,
  onClose: handleClose,
})

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue) ?? null
)

const classes = computed(() => ({
  'ui-autocomplete--disabled': attrs.disabled,
  'ui-autocomplete--open': isOpen.value,
}))

function defaultFilter(query: string, option: ISelectOption<T>): boolean {
  return option.label.toLowerCase().includes(query.toLowerCase())
}

function selectByIndex(index: number) {
  const option = filteredOptions.value[index]
  if (!option || option.disabled) return
  selectOption(option)
}

function selectOption(option: ISelectOption<T>) {
  if (option.disabled) return
  searchQuery.value = option.label
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

function handleClose() {
  if (!props.freeText && selectedOption.value) {
    searchQuery.value = selectedOption.value.label
  } else if (!props.freeText && !selectedOption.value) {
    searchQuery.value = ''
  }
}

function clearValue() {
  searchQuery.value = ''
  emit('update:modelValue', null)
  emit('change', null)
  inputRef.value?.focus()
}

const emitSearch = useDebounceFn((query: string) => {
  emit('search', query)
}, props.debounce)

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  searchQuery.value = value
  emitSearch(value)
  if (!isOpen.value) open()
  highlightedIndex.value = -1
}

function onFocus() {
  if (!isOpen.value) open()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Space') return
  baseHandleKeydown(event)
}

// sync searchQuery when modelValue changes externally
watch(() => props.modelValue, () => {
  if (selectedOption.value) {
    searchQuery.value = selectedOption.value.label
  } else {
    searchQuery.value = ''
  }
}, { immediate: true })

</script>
<template>
<label
  class="ui-autocomplete"
  :class="classes"
  ref="containerRef"
>
  <div class="ui-autocomplete__label"><slot /></div>
  <div class="ui-autocomplete__trigger">
    <input
      ref="inputRef"
      class="ui-autocomplete__input"
      :value="searchQuery"
      :placeholder="placeholder"
      v-bind="$attrs"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      @input="onInput"
      @focus="onFocus"
      @keydown="handleKeydown"
    />
    <fa
      v-if="loading"
      class="ui-autocomplete__spinner rotate"
      icon="circle-notch"
    />
    <fa
      v-else-if="modelValue != null"
      class="ui-autocomplete__clear"
      icon="times"
      @click="clearValue"
    />
  </div>
  <div
    v-show="isOpen"
    ref="dropdownRef"
    class="ui-autocomplete__dropdown"
    :style="dropdownStyle"
    role="listbox"
  >
    <div
      v-for="(option, index) in filteredOptions"
      :key="index"
      :data-dropdown-index="index"
      class="ui-autocomplete__option"
      :class="{
        'ui-autocomplete__option--selected': option.value === modelValue,
        'ui-autocomplete__option--highlighted': highlightedIndex === index,
        'ui-autocomplete__option--disabled': option.disabled,
      }"
      role="option"
      :aria-selected="option.value === modelValue"
      @click="selectOption(option)"
      @mouseenter="highlightedIndex = index"
    >
      <slot name="option" :option="option" :highlighted="highlightedIndex === index" :query="searchQuery">
        {{ option.label }}
      </slot>
    </div>
    <div
      v-if="filteredOptions.length === 0 && !loading"
      class="ui-autocomplete__no-results"
    >
      <slot name="no-results">No results</slot>
    </div>
    <div
      v-if="loading && filteredOptions.length === 0"
      class="ui-autocomplete__loading"
    >
      <slot name="loading">Loading...</slot>
    </div>
  </div>
</label>
</template>
