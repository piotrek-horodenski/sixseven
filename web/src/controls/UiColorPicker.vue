<script setup lang="ts">

import { ref, computed, watch, nextTick, useAttrs } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { hexToHsv, hsvToHex, hsvToRgb, hueToHex, isValidHex, hexToRgb, rgbToHex, rgbToHsv, hexToHsl, hslToRgb, type HSV } from '@/utils/color'
import { useColorPresetsStore } from '@/stores/color-presets/color-presets.store'

const presetsStore = useColorPresetsStore()

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  modelValue: string
  hasOpacity?: boolean
}>(), {
  hasOpacity: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const satvalRef = ref<HTMLElement | null>(null)
const hueRef = ref<HTMLElement | null>(null)

const isOpen = ref(false)
const panelPlacement = ref<'below' | 'above'>('below')
const isDragging = ref(false)
const activeTab = ref<'picker' | 'presets'>('picker')
const inputFormat = ref<'hex' | 'rgb' | 'hsl'>('hex')

// --- Alpha + hex parsing ---

function parseModelValue(value: string): { hsv: HSV; alpha: number } {
  const clean = value.replace('#', '')
  if (clean.length === 8) {
    const a = parseInt(clean.substring(0, 2), 16)
    const hex6 = '#' + clean.substring(2)
    return { hsv: hexToHsv(hex6), alpha: a }
  }
  return { hsv: hexToHsv(value), alpha: 255 }
}

function buildOutput(hsvVal: HSV, alphaVal: number): string {
  const hex6 = hsvToHex(hsvVal)
  if (!props.hasOpacity) return hex6
  const aa = Math.round(alphaVal).toString(16).padStart(2, '0')
  return '#' + aa + hex6.substring(1)
}

function isValidInput(value: string): boolean {
  if (props.hasOpacity) return /^#[0-9a-fA-F]{8}$/.test(value)
  return isValidHex(value)
}

const parsed = parseModelValue(props.modelValue)
const hsv = ref<HSV>(parsed.hsv)
const alpha = ref(parsed.alpha)
const alphaRef = ref<HTMLElement | null>(null)

const INPUT_FORMATS: Array<'hex' | 'rgb' | 'hsl'> = ['hex', 'rgb', 'hsl']

function cycleFormat() {
  const idx = INPUT_FORMATS.indexOf(inputFormat.value)
  inputFormat.value = INPUT_FORMATS[(idx + 1) % INPUT_FORMATS.length]
}

const formatLabel = computed(() => {
  const base = inputFormat.value.toUpperCase()
  return props.hasOpacity ? base + 'A' : base
})

const rgbValues = computed(() => {
  const { r, g, b } = hsvToRgb(hsv.value)
  return { r, g, b }
})

const hslValues = computed(() => {
  const { r, g, b } = hsvToRgb(hsv.value)
  return hexToHsl(rgbToHex(r, g, b))
})

// --- Presets (DB via store) ---

function stripAlpha(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length === 8) return '#' + clean.substring(2)
  return hex
}

function presetDisplayColor(hex: string): string {
  return toDisplayColor(hex)
}

function presetHasAlpha(hex: string): boolean {
  return hex.replace('#', '').length === 8
}

function saveCurrentAsPreset() {
  presetsStore.createPreset(props.modelValue)
}

function removePreset(_id: string) {
  presetsStore.deletePreset(_id)
}

// --- Computed ---

const hueHex = computed(() => hueToHex(hsv.value.h))

function toDisplayColor(value: string): string {
  const clean = value.replace('#', '')
  if (clean.length === 8) {
    const a = parseInt(clean.substring(0, 2), 16)
    const r = parseInt(clean.substring(2, 4), 16)
    const g = parseInt(clean.substring(4, 6), 16)
    const b = parseInt(clean.substring(6, 8), 16)
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`
  }
  return value
}

const swatchRgba = computed(() => toDisplayColor(props.modelValue))

const classes = computed(() => ({
  'ui-color-picker--disabled': attrs.disabled,
  'ui-color-picker--open': isOpen.value,
}))

// --- Watchers ---

watch(() => props.modelValue, (value) => {
  if (isDragging.value) return
  if (isValidInput(value)) {
    const p = parseModelValue(value)
    hsv.value = p.hsv
    alpha.value = p.alpha
  }
})

onClickOutside(containerRef, () => {
  if (isOpen.value) close()
})

// --- Open / Close ---

function updateColor() {
  emit('update:modelValue', buildOutput(hsv.value, alpha.value))
}

function commitChange() {
  emit('change', buildOutput(hsv.value, alpha.value))
}

function open() {
  if (isOpen.value) return
  isOpen.value = true
  nextTick(() => {
    if (!panelRef.value || !triggerRef.value) return
    const triggerRect = triggerRef.value.getBoundingClientRect()
    const panelHeight = panelRef.value.scrollHeight
    const spaceBelow = window.innerHeight - triggerRect.bottom - 4
    panelPlacement.value = spaceBelow >= panelHeight ? 'below' : 'above'
  })
}

function close() {
  if (!isOpen.value) return
  isOpen.value = false
}

function toggle() {
  isOpen.value ? close() : open()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    close()
    triggerRef.value?.focus()
  }
}

// --- Saturation/Brightness dragging ---

function getSatValFromEvent(e: PointerEvent) {
  const rect = satvalRef.value!.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
  hsv.value = {
    ...hsv.value,
    s: (x / rect.width) * 100,
    v: 100 - (y / rect.height) * 100,
  }
}

function onSatValPointerDown(e: PointerEvent) {
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  getSatValFromEvent(e)
  updateColor()
}

function onSatValPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  getSatValFromEvent(e)
  updateColor()
}

function onSatValPointerUp() {
  if (!isDragging.value) return
  isDragging.value = false
  commitChange()
}

// --- Hue dragging ---

function getHueFromEvent(e: PointerEvent) {
  const rect = hueRef.value!.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  hsv.value = {
    ...hsv.value,
    h: (x / rect.width) * 360,
  }
}

function onHuePointerDown(e: PointerEvent) {
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  getHueFromEvent(e)
  updateColor()
}

function onHuePointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  getHueFromEvent(e)
  updateColor()
}

function onHuePointerUp() {
  if (!isDragging.value) return
  isDragging.value = false
  commitChange()
}

// --- Alpha dragging ---

const alphaGradient = computed(() => {
  const hex6 = hsvToHex(hsv.value)
  return `linear-gradient(to right, transparent, ${hex6})`
})

function getAlphaFromEvent(e: PointerEvent) {
  const rect = alphaRef.value!.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  alpha.value = (x / rect.width) * 255
}

function onAlphaPointerDown(e: PointerEvent) {
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  getAlphaFromEvent(e)
  updateColor()
}

function onAlphaPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  getAlphaFromEvent(e)
  updateColor()
}

function onAlphaPointerUp() {
  if (!isDragging.value) return
  isDragging.value = false
  commitChange()
}

// --- Color input ---

function onHexInput(e: Event) {
  let value = (e.target as HTMLInputElement).value.trim()
  if (value && !value.startsWith('#')) {
    value = '#' + value
  }
  if (isValidInput(value)) {
    const p = parseModelValue(value)
    hsv.value = p.hsv
    alpha.value = p.alpha
    emit('update:modelValue', value)
    emit('change', value)
  }
}

function onRgbInput(channel: 'r' | 'g' | 'b', e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const clamped = Math.max(0, Math.min(255, val))
  const rgb = { ...rgbValues.value, [channel]: clamped }
  hsv.value = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const out = buildOutput(hsv.value, alpha.value)
  emit('update:modelValue', out)
  emit('change', out)
}

function onHslInput(channel: 'h' | 's' | 'l', e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const max = channel === 'h' ? 360 : 100
  const clamped = Math.max(0, Math.min(max, val))
  const hsl = { ...hslValues.value, [channel]: clamped }
  const { r, g, b } = hslToRgb(hsl)
  hsv.value = rgbToHsv(r, g, b)
  const out = buildOutput(hsv.value, alpha.value)
  emit('update:modelValue', out)
  emit('change', out)
}

function onAlphaInput(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  alpha.value = Math.max(0, Math.min(255, val))
  const out = buildOutput(hsv.value, alpha.value)
  emit('update:modelValue', out)
  emit('change', out)
}

// --- Presets ---

function selectPreset(hex: string) {
  const effective = props.hasOpacity ? hex : stripAlpha(hex)
  const p = parseModelValue(effective)
  hsv.value = p.hsv
  alpha.value = p.alpha
  emit('update:modelValue', effective)
  emit('change', effective)
}

</script>
<template>
<div
  class="ui-color-picker"
  :class="classes"
  ref="containerRef"
>
  <div class="ui-color-picker__label"><slot /></div>
  <button
    type="button"
    class="ui-color-picker__trigger"
    ref="triggerRef"
    v-bind="$attrs"
    @click="toggle"
    @keydown="handleKeydown"
  >
    <span
      class="ui-color-picker__swatch"
      :class="{ 'ui-color-picker__swatch--checkerboard': props.hasOpacity }"
    >
      <span
        class="ui-color-picker__swatch-color"
        :style="{ backgroundColor: props.hasOpacity ? swatchRgba : props.modelValue }"
      />
    </span>
    <span class="ui-color-picker__value">{{ props.modelValue }}</span>
    <fa
      class="ui-color-picker__chevron"
      icon="chevron-down"
    />
  </button>
  <div
    v-show="isOpen"
    ref="panelRef"
    class="ui-color-picker__panel"
    :class="'ui-color-picker__panel--' + panelPlacement"
  >
    <!-- Tabs -->
    <div class="ui-color-picker__tabs">
      <a
        class="ui-color-picker__tab"
        :class="{ 'ui-color-picker__tab--active': activeTab === 'picker' }"
        @click.prevent="activeTab = 'picker'"
      >Pick color</a>
      <a
        class="ui-color-picker__tab"
        :class="{ 'ui-color-picker__tab--active': activeTab === 'presets' }"
        @click.prevent="activeTab = 'presets'"
      >Presets</a>
    </div>

    <!-- Tab bodies -->
    <div class="ui-color-picker__tab-body">

    <!-- Pick color tab -->
    <div class="ui-color-picker__picker-tab" :class="{ 'ui-color-picker__tab-hidden': activeTab !== 'picker' }">
      <div
        ref="satvalRef"
        class="ui-color-picker__satval"
        :style="{ backgroundColor: hueHex }"
        @pointerdown.prevent="onSatValPointerDown"
        @pointermove="onSatValPointerMove"
        @pointerup="onSatValPointerUp"
      >
        <div class="ui-color-picker__satval-white" />
        <div class="ui-color-picker__satval-black" />
        <div
          class="ui-color-picker__satval-cursor"
          :style="{ left: hsv.s + '%', top: (100 - hsv.v) + '%' }"
        />
      </div>
      <div
        ref="hueRef"
        class="ui-color-picker__hue"
        @pointerdown.prevent="onHuePointerDown"
        @pointermove="onHuePointerMove"
        @pointerup="onHuePointerUp"
      >
        <div
          class="ui-color-picker__hue-cursor"
          :style="{ left: (hsv.h / 360 * 100) + '%' }"
        />
      </div>
      <div
        v-if="props.hasOpacity"
        ref="alphaRef"
        class="ui-color-picker__alpha"
        @pointerdown.prevent="onAlphaPointerDown"
        @pointermove="onAlphaPointerMove"
        @pointerup="onAlphaPointerUp"
      >
        <div
          class="ui-color-picker__alpha-gradient"
          :style="{ background: alphaGradient }"
        />
        <div
          class="ui-color-picker__alpha-cursor"
          :style="{ left: (alpha / 255 * 100) + '%' }"
        />
      </div>
      <div class="ui-color-picker__inputs">
        <a
          class="ui-color-picker__format-label"
          @click.prevent="cycleFormat"
          v-tooltip="'Switch format (current: ' + formatLabel + ')'"
        >{{ formatLabel }}</a>
        <div v-if="inputFormat === 'hex'" class="ui-color-picker__input-fields">
          <input
            type="text"
            class="ui-color-picker__field"
            :value="props.modelValue"
            :maxlength="props.hasOpacity ? 9 : 7"
            :placeholder="props.hasOpacity ? '#ff000000' : '#000000'"
            @change="onHexInput"
          />
        </div>
        <div v-else-if="inputFormat === 'rgb'" class="ui-color-picker__input-fields">
          <input
            type="number"
            class="ui-color-picker__field"
            :value="rgbValues.r"
            min="0" max="255"
            @change="onRgbInput('r', $event)"
          />
          <input
            type="number"
            class="ui-color-picker__field"
            :value="rgbValues.g"
            min="0" max="255"
            @change="onRgbInput('g', $event)"
          />
          <input
            type="number"
            class="ui-color-picker__field"
            :value="rgbValues.b"
            min="0" max="255"
            @change="onRgbInput('b', $event)"
          />
          <input
            v-if="props.hasOpacity"
            type="number"
            class="ui-color-picker__field"
            :value="Math.round(alpha)"
            min="0" max="255"
            @change="onAlphaInput"
          />
        </div>
        <div v-else class="ui-color-picker__input-fields">
          <input
            type="number"
            class="ui-color-picker__field"
            :value="Math.round(hslValues.h)"
            min="0" max="360"
            @change="onHslInput('h', $event)"
          />
          <input
            type="number"
            class="ui-color-picker__field"
            :value="Math.round(hslValues.s)"
            min="0" max="100"
            @change="onHslInput('s', $event)"
          />
          <input
            type="number"
            class="ui-color-picker__field"
            :value="Math.round(hslValues.l)"
            min="0" max="100"
            @change="onHslInput('l', $event)"
          />
          <input
            v-if="props.hasOpacity"
            type="number"
            class="ui-color-picker__field"
            :value="Math.round(alpha)"
            min="0" max="255"
            @change="onAlphaInput"
          />
        </div>
      </div>
      <a
        class="ui-color-picker__save-preset"
        @click.prevent="saveCurrentAsPreset"
      >
        <fa icon="plus" />
        Save as preset
      </a>
    </div>

    <!-- Presets tab -->
    <div class="ui-color-picker__presets-tab" :class="{ 'ui-color-picker__tab-hidden': activeTab !== 'presets' }">
      <div v-if="presetsStore.colorPresets.length" class="ui-color-picker__presets-grid">
        <div
          v-for="preset in presetsStore.colorPresets"
          :key="preset._id"
          class="ui-color-picker__preset-item"
        >
          <a
            class="ui-color-picker__preset"
            :class="{
              'ui-color-picker__preset--active': preset.hex === props.modelValue.toLowerCase(),
              'ui-color-picker__preset--checkerboard': presetHasAlpha(preset.hex),
            }"
            :title="preset.hex"
            @click.prevent="selectPreset(preset.hex)"
          >
            <span
              class="ui-color-picker__preset-color"
              :style="{ backgroundColor: presetDisplayColor(preset.hex) }"
            />
          </a>
          <button
            type="button"
            class="ui-color-picker__preset-remove"
            title="Remove preset"
            @click="removePreset(preset._id)"
          >
            <fa icon="times" />
          </button>
        </div>
      </div>
      <div v-else class="ui-color-picker__presets-empty">
        No saved presets yet
      </div>
    </div>

    </div><!-- /tab-body -->
  </div>
</div>
</template>
