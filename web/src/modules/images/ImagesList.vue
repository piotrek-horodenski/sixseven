<script setup lang="ts">

import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images/images.store'
import { usePermission } from '@/composables/usePermission'
import type { IImage } from '@/stores/images/images.model'
import { getThumbUrl, getImageUrl } from '@/stores/images/images.api'

const store = useImagesStore()
const { hasPermission } = usePermission()
const route = useRoute()
const router = useRouter()

const emit = defineEmits<{
  (event: 'open', image: IImage): void
  (event: 'delete', image: IImage, force: boolean): void
}>()

const allSelected = computed(() =>
  store.images.length > 0 && store.images.every(img => store.selectedIds.has(img._id)),
)

const someSelected = computed(() =>
  store.selectedCount > 0 && !allSelected.value,
)

function toggleSelectAll() {
  if (allSelected.value) {
    store.deselectAll()
  } else {
    store.selectAll()
  }
}

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString()
}

function onDblClick(image: IImage) {
  window.open(getImageUrl(image._id), '_blank')
}

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

function openFirstNewSelection(before: Set<string>) {
  if (store.selectedCount === 0) return
  for (const id of store.selectedIds) {
    if (before.has(id)) return
  }
  const first = sortedImages.value.find(img => store.selectedIds.has(img._id))
  if (first) emit('open', first)
}

function onClick(image: IImage, event: MouseEvent) {
  if (wasDragging) {
    wasDragging = false
    return
  }
  if (event.ctrlKey || event.metaKey) {
    const before = new Set(store.selectedIds)
    store.toggleSelect(image._id)
    openFirstNewSelection(before)
  } else if (event.shiftKey) {
    const before = new Set(store.selectedIds)
    store.shiftSelect(image._id)
    openFirstNewSelection(before)
  } else if (store.selectedCount > 0) {
    store.deselectAll()
    store.toggleSelect(image._id)
    emit('open', image)
  } else {
    emit('open', image)
  }
}

// --- Rectangle selection ---
const isDragging = ref(false)
const selectRect = reactive({ x: 0, y: 0, w: 0, h: 0 })
let startX = 0
let startY = 0
let ctrlHeld = false
let preSelection = new Set<string>()
let rafId = 0
let wasDragging = false
let startedOnRow = false

function isDragAllowed(target: EventTarget | null): boolean {
  if (!target || !areaEl.value) return false
  const el = target as HTMLElement
  if (el.closest('thead')) return false
  if (el.closest('.ui-checkbox')) return false
  if (el.closest('.ui-button')) return false
  if (el.closest('.image-tag')) return false
  if (el.closest('.image-collection')) return false
  return areaEl.value.contains(el)
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  if (!isDragAllowed(event.target)) return
  if (!areaEl.value) return

  startedOnRow = !!(event.target as HTMLElement).closest('.admin-table__row')

  // Only prevent default for blank space clicks — rows need native click to fire
  if (!startedOnRow) event.preventDefault()

  ctrlHeld = event.ctrlKey || event.metaKey
  preSelection = ctrlHeld ? new Set(store.selectedIds) : new Set()

  const areaRect = areaEl.value.getBoundingClientRect()
  startX = event.clientX - areaRect.left + areaEl.value.scrollLeft
  startY = event.clientY - areaRect.top + areaEl.value.scrollTop

  selectRect.x = startX
  selectRect.y = startY
  selectRect.w = 0
  selectRect.h = 0
  isDragging.value = true

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent) {
  if (!isDragging.value || !areaEl.value) return

  const areaRect = areaEl.value.getBoundingClientRect()
  const maxW = areaEl.value.scrollWidth
  const maxH = areaEl.value.scrollHeight

  const curX = Math.max(0, Math.min(maxW, event.clientX - areaRect.left + areaEl.value.scrollLeft))
  const curY = Math.max(0, Math.min(maxH, event.clientY - areaRect.top + areaEl.value.scrollTop))

  selectRect.x = Math.min(startX, curX)
  selectRect.y = Math.min(startY, curY)
  selectRect.w = Math.abs(curX - startX)
  selectRect.h = Math.abs(curY - startY)

  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(updateSelection)
}

function updateSelection() {
  if (!areaEl.value) return

  const areaRect = areaEl.value.getBoundingClientRect()
  const scrollLeft = areaEl.value.scrollLeft
  const scrollTop = areaEl.value.scrollTop

  const selLeft = selectRect.x - scrollLeft + areaRect.left
  const selTop = selectRect.y - scrollTop + areaRect.top
  const selRight = selLeft + selectRect.w
  const selBottom = selTop + selectRect.h

  const rows = areaEl.value.querySelectorAll('.admin-table__row')
  const next = new Set(preSelection)

  rows.forEach((row, index) => {
    const rowRect = row.getBoundingClientRect()
    const overlaps =
      rowRect.left < selRight &&
      rowRect.right > selLeft &&
      rowRect.top < selBottom &&
      rowRect.bottom > selTop

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
  const wasDrag = selectRect.w > 3 || selectRect.h > 3
  isDragging.value = false
  wasDragging = wasDrag
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  cancelAnimationFrame(rafId)

  if (wasDrag) {
    openFirstNewSelection(preSelection)
  }

  // Only deselect on plain click in blank space, not on rows
  if (!wasDrag && !ctrlHeld && !startedOnRow) {
    store.deselectAll()
    if (route.name !== 'images') {
      router.push('/images')
    }
  }
}

</script>
<template>
<div
  ref="areaEl"
  class="images-list"
  :style="{ minHeight: areaMinHeight }"
  @mousedown="onMouseDown"
>
  <table class="admin-table">
    <thead>
      <tr>
        <th class="images-list__th-check">
          <UiCheckbox
            :modelValue="allSelected || someSelected"
            :indeterminate="someSelected"
            @update:modelValue="toggleSelectAll"
          />
        </th>
        <th class="images-list__th-thumb"></th>
        <th class="images-list__th-sortable" @click="toggleSort('title')">
          Title <fa v-if="sortIcon('title')" :icon="sortIcon('title')!" />
        </th>
        <th class="images-list__th-sortable" @click="toggleSort('_tags')">
          Tags <fa v-if="sortIcon('_tags')" :icon="sortIcon('_tags')!" />
        </th>
        <th class="images-list__th-sortable" @click="toggleSort('_collections')">
          Collections <fa v-if="sortIcon('_collections')" :icon="sortIcon('_collections')!" />
        </th>
        <th class="images-list__th-sortable" @click="toggleSort('meta.fileSize')">
          Size <fa v-if="sortIcon('meta.fileSize')" :icon="sortIcon('meta.fileSize')!" />
        </th>
        <th class="images-list__th-sortable" @click="toggleSort('_dimensions')">
          Dimensions <fa v-if="sortIcon('_dimensions')" :icon="sortIcon('_dimensions')!" />
        </th>
        <th class="images-list__th-sortable" @click="toggleSort('createdAt')">
          Date <fa v-if="sortIcon('createdAt')" :icon="sortIcon('createdAt')!" />
        </th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="image in sortedImages"
        :key="image._id"
        class="admin-table__row admin-table__row--clickable"
        :class="{
          'admin-table__row--selected': store.selectedIds.has(image._id),
          'images-list__row--deleted': image.isDeleted,
        }"
        @click="onClick(image, $event)"
        @dblclick="onDblClick(image)"
      >
        <td class="images-list__check" @click.stop>
          <UiCheckbox
            :modelValue="store.selectedIds.has(image._id)"
            @update:modelValue="store.toggleSelect(image._id)"
          />
        </td>
        <td class="images-list__thumb">
          <img :src="getThumbUrl(image._id)" :alt="image.title" loading="lazy" />
        </td>
        <td>{{ image.title }}</td>
        <td>
          <span
            v-for="tag in image.tags?.slice(0, 3)"
            :key="tag.name"
            class="image-tag"
            :class="{ 'image-tag--active': store.selectedTags.includes(tag.name) }"
            @click.stop="store.toggleTag(tag.name)"
          >{{ tag.name }}</span>
          <span
            v-if="(image.tags?.length ?? 0) > 3"
            class="admin-tag-overflow"
            :title="image.tags!.slice(3).map(t => t.name).join(', ')"
          ><fa icon="ellipsis" /></span>
          <span v-if="!image.tags?.length" class="admin-muted">none</span>
        </td>
        <td>
          <span
            v-for="col in image.collections?.slice(0, 3)"
            :key="col.name"
            class="image-collection"
            :class="{ 'image-collection--active': store.selectedCollection === col.name }"
            @click.stop="store.setCollection(col.name)"
          >{{ col.name }}</span>
          <span
            v-if="(image.collections?.length ?? 0) > 3"
            class="admin-tag-overflow"
            :title="image.collections!.slice(3).map(c => c.name).join(', ')"
          ><fa icon="ellipsis" /></span>
          <span v-if="!image.collections?.length" class="admin-muted">none</span>
        </td>
        <td>{{ image.meta ? formatSize(image.meta.fileSize) : '-' }}</td>
        <td>{{ image.meta ? `${image.meta.width}x${image.meta.height}` : '-' }}</td>
        <td>{{ (image as any).createdAt ? formatDate((image as any).createdAt) : '-' }}</td>
        <td class="admin-table__actions" @click.stop>
          <UiButton
            v-if="hasPermission('control-images')"
            icon="trash"
            @click="emit('delete', image, false)"
          />
        </td>
      </tr>
      <tr v-if="!store.images.length && !store.loading">
        <td colspan="9" class="admin-muted" style="text-align: center; padding: 2rem">
          No images found
        </td>
      </tr>
    </tbody>
  </table>

  <div ref="sentinel" class="images-list__sentinel">
    <UiLoader v-if="store.loadingMore" />
  </div>

  <div
    v-if="isDragging && (selectRect.w > 3 || selectRect.h > 3)"
    class="images-list__select-rect"
    :style="{
      left: selectRect.x + 'px',
      top: selectRect.y + 'px',
      width: selectRect.w + 'px',
      height: selectRect.h + 'px',
    }"
  ></div>
</div>
</template>
