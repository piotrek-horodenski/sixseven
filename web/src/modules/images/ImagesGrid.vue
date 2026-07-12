<script setup lang="ts">

import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useImagesStore } from '@/stores/images/images.store'
import type { IImage } from '@/stores/images/images.model'
import ImageCard from './ImageCard.vue'

const emit = defineEmits<{
  (event: 'open', image: IImage): void
}>()

const store = useImagesStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const sentinel = ref<HTMLElement | null>(null)
const areaEl = ref<HTMLElement | null>(null)
const areaMinHeight = ref('0px')
let observer: IntersectionObserver | null = null

function recalcHeight() {
  if (!areaEl.value) return
  const rect = areaEl.value.getBoundingClientRect()
  const remaining = window.innerHeight - rect.top
  areaMinHeight.value = Math.max(0, remaining) + 'px'
}

// --- Lazy loading ---
onMounted(() => {
  recalcHeight()
  window.addEventListener('resize', recalcHeight)

  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && store.hasMore && !store.loadingMore) {
        store.loadMore()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', recalcHeight)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

function onOpen(image: IImage) {
  emit('open', image)
}

// --- Sorting ---
const clientSortFns: Record<string, (img: IImage) => number> = {
  _dimensions: img => (img.meta?.width ?? 0) * (img.meta?.height ?? 0),
  _tags: img => img.tags?.length ?? 0,
  _collections: img => img.collections?.length ?? 0,
}

const sortedImages = computed(() => {
  const fn = clientSortFns[store.sortBy]
  if (!fn) return store.images
  const dir = store.sortDirection
  return [...store.images].sort((a, b) => (fn(a) - fn(b)) * dir)
})

function toggleSort(field: string) {
  if (store.sortBy === field) {
    store.setSort(field, store.sortDirection === 1 ? -1 : 1)
  } else {
    store.setSort(field, -1)
  }
}

function sortIcon(field: string): string | null {
  if (store.sortBy !== field) return null
  return store.sortDirection === 1 ? 'arrow-up' : 'arrow-down'
}

const sortColumns = computed(() => [
  { field: 'title', label: t('images.imageTitle') },
  { field: '_tags', label: t('images.tags') },
  { field: '_collections', label: t('images.collections') },
  { field: 'meta.fileSize', label: t('images.size') },
  { field: '_dimensions', label: t('images.dimensions') },
  { field: 'createdAt', label: t('images.date') },
])

// --- Rectangle selection ---
const isDragging = ref(false)
const rect = reactive({ x: 0, y: 0, w: 0, h: 0 })
let startX = 0
let startY = 0
let ctrlHeld = false
let preSelection = new Set<string>()
let rafId = 0

let wasDragging = false

function isDragAllowed(target: EventTarget | null): boolean {
  if (!target || !areaEl.value) return false
  const el = target as HTMLElement
  if (el.closest('.image-card__checkbox')) return false
  return areaEl.value.contains(el)
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  if (!isDragAllowed(event.target)) return
  if (!areaEl.value) return

  event.preventDefault()
  ctrlHeld = event.ctrlKey || event.metaKey
  preSelection = ctrlHeld ? new Set(store.selectedIds) : new Set()

  const areaRect = areaEl.value.getBoundingClientRect()
  startX = event.clientX - areaRect.left + areaEl.value.scrollLeft
  startY = event.clientY - areaRect.top + areaEl.value.scrollTop

  rect.x = startX
  rect.y = startY
  rect.w = 0
  rect.h = 0
  isDragging.value = true

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent) {
  if (!isDragging.value || !areaEl.value) return

  const areaRect = areaEl.value.getBoundingClientRect()
  const maxW = areaEl.value.scrollWidth
  const maxH = areaEl.value.scrollHeight

  // Clamp cursor position to container bounds
  const curX = Math.max(0, Math.min(maxW, event.clientX - areaRect.left + areaEl.value.scrollLeft))
  const curY = Math.max(0, Math.min(maxH, event.clientY - areaRect.top + areaEl.value.scrollTop))

  rect.x = Math.min(startX, curX)
  rect.y = Math.min(startY, curY)
  rect.w = Math.abs(curX - startX)
  rect.h = Math.abs(curY - startY)

  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(updateSelection)
}

function updateSelection() {
  if (!areaEl.value) return

  const areaRect = areaEl.value.getBoundingClientRect()
  const scrollLeft = areaEl.value.scrollLeft
  const scrollTop = areaEl.value.scrollTop

  // Selection rect in viewport coordinates
  const selLeft = rect.x - scrollLeft + areaRect.left
  const selTop = rect.y - scrollTop + areaRect.top
  const selRight = selLeft + rect.w
  const selBottom = selTop + rect.h

  const cards = areaEl.value.querySelectorAll('.image-card')
  const next = new Set(preSelection)

  cards.forEach((card, index) => {
    const cardRect = card.getBoundingClientRect()
    const overlaps =
      cardRect.left < selRight &&
      cardRect.right > selLeft &&
      cardRect.top < selBottom &&
      cardRect.bottom > selTop

    const image = sortedImages.value[index]
    if (!image) return

    if (overlaps) {
      if (preSelection.has(image._id)) {
        next.delete(image._id)
      } else {
        next.add(image._id)
      }
    }
  })

  store.selectedIds = next
}

function onMouseUp() {
  const wasDrag = rect.w > 3 || rect.h > 3
  isDragging.value = false
  wasDragging = wasDrag
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  cancelAnimationFrame(rafId)

  // Plain click on blank space (no drag) — deselect all and go back to base route
  if (!wasDrag && !ctrlHeld) {
    store.deselectAll()
    if (route.name !== 'images') {
      router.push('/images')
    }
  }
}

function onAreaClick(event: MouseEvent) {
  if (wasDragging) {
    wasDragging = false
    event.stopPropagation()
    event.preventDefault()
  }
}

</script>
<template>
<div
  ref="areaEl"
  class="images-grid-area"
  :style="{ minHeight: areaMinHeight }"
  @mousedown="onMouseDown"
  @click.capture="onAreaClick"
>
  <div class="images-grid__sort-bar">
    <span
      v-for="col in sortColumns"
      :key="col.field"
      class="images-grid__sort-item"
      :class="{ 'images-grid__sort-item--active': store.sortBy === col.field }"
      @click="toggleSort(col.field)"
    >
      {{ col.label }}
      <fa v-if="sortIcon(col.field)" :icon="sortIcon(col.field)!" />
    </span>
  </div>
  <div class="images-grid">
    <ImageCard
      v-for="image in sortedImages"
      :key="image._id"
      :image="image"
      @open="onOpen"
    />
  </div>

  <div v-if="!store.images.length && !store.loading" class="images-grid__empty">
    <fa icon="images" />
    <p>{{ $t('images.noImagesFound') }}</p>
  </div>

  <div ref="sentinel" class="images-grid__sentinel">
    <UiLoader v-if="store.loadingMore" />
  </div>

  <div
    v-if="isDragging && (rect.w > 3 || rect.h > 3)"
    class="images-grid-area__select-rect"
    :style="{
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.w + 'px',
      height: rect.h + 'px',
    }"
  ></div>
</div>
</template>
