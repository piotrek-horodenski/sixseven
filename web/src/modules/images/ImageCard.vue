<script setup lang="ts">

import { computed } from 'vue'
import type { IImage } from '@/stores/images/images.model'
import { getThumbUrl, getImageUrl } from '@/stores/images/images.api'
import { useImagesStore } from '@/stores/images/images.store'

const props = defineProps<{
  image: IImage
}>()

const emit = defineEmits<{
  (event: 'open', image: IImage): void
}>()

const store = useImagesStore()

const isSelected = computed(() => store.selectedIds.has(props.image._id))
const thumbSrc = computed(() => getThumbUrl(props.image._id))

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const tooltip = computed(() => {
  const img = props.image
  const src = getThumbUrl(img._id)

  let imgTag = ''
  if (img.meta?.width && img.meta?.height) {
    const aspect = img.meta.width / img.meta.height
    const maxSize = 200
    const w = aspect >= 1 ? maxSize : Math.round(maxSize * aspect)
    const h = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize
    imgTag = `<img src="${src}" width="${w}" height="${h}" style="display:block;border-radius:4px;margin-bottom:6px;object-fit:cover" />`
  }

  const parts = [`<b>${img.title}</b>`]
  if (img.meta?.width && img.meta?.height) {
    parts.push(`${img.meta.width} x ${img.meta.height}`)
  }
  if (img.meta?.fileSize) {
    parts.push(formatSize(img.meta.fileSize))
  }
  if (img.tags?.length) {
    parts.push(img.tags.map(t => `<span style="display:inline-block;padding:0.1rem 0.4rem;margin:0.1rem;border-radius:10rem;font-size:0.75rem;background:#80cbc4;color:#1a1a1a">${t.name}</span>`).join(''))
  }
  if (img.collections?.length) {
    parts.push(img.collections.map(c => `<span style="display:inline-block;padding:0.1rem 0.4rem;margin:0.1rem;border-radius:10rem;font-size:0.75rem;background:#b39ddb;color:#1a1a1a">${c.name}</span>`).join(''))
  }
  return imgTag + parts.join('<br>')
})

function openFirstNewSelection(before: Set<string>) {
  if (store.selectedCount === 0) return
  for (const id of store.selectedIds) {
    if (before.has(id)) return
  }
  const first = store.images.find(img => store.selectedIds.has(img._id))
  if (first) emit('open', first)
}

function onClick(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) {
    const before = new Set(store.selectedIds)
    store.toggleSelect(props.image._id)
    openFirstNewSelection(before)
  } else if (event.shiftKey) {
    const before = new Set(store.selectedIds)
    store.shiftSelect(props.image._id)
    openFirstNewSelection(before)
  } else if (store.selectedCount > 0) {
    store.deselectAll()
    store.toggleSelect(props.image._id)
    emit('open', props.image)
  } else {
    emit('open', props.image)
  }
}

function onDblClick() {
  window.open(getImageUrl(props.image._id), '_blank')
}

function onCheckboxClick(event: MouseEvent) {
  event.stopPropagation()
  store.toggleSelect(props.image._id)
}

</script>
<template>
<div
  class="image-card"
  :class="{
    'image-card--selected': isSelected,
    'image-card--deleted': image.isDeleted,
  }"
  v-tooltip="tooltip"
  @click="onClick"
  @dblclick="onDblClick"
>
  <div class="image-card__checkbox" @click="onCheckboxClick">
    <fa v-if="isSelected" icon="check" />
  </div>
  <div class="image-card__thumb">
    <img :src="thumbSrc" :alt="image.title" loading="lazy" />
  </div>
  <div class="image-card__title">{{ image.title }}</div>
</div>
</template>
