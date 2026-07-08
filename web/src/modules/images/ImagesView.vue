<script setup lang="ts">

import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images/images.store'
import type { IImage } from '@/stores/images/images.model'
import ImagesGrid from './ImagesGrid.vue'
import ImagesList from './ImagesList.vue'
import ImageUploadPopup from './ImageUploadPopup.vue'
import ImageDeleteConfirm from './ImageDeleteConfirm.vue'

const store = useImagesStore()
const router = useRouter()

const showDeleteConfirm = ref(false)
const deleteTarget = ref<IImage | null>(null)
const deleteForce = ref(false)
const dragOver = ref(false)
let dragCounter = 0

// Document-level drag-drop for full viewport coverage
function onDocDragEnter(event: DragEvent) {
  event.preventDefault()
  dragCounter++
  if (event.dataTransfer?.types.includes('Files')) {
    dragOver.value = true
  }
}

function onDocDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDocDragLeave(event: DragEvent) {
  event.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    dragOver.value = false
  }
}

function onDocDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter = 0
  dragOver.value = false
  const files = event.dataTransfer?.files
  if (files?.length) {
    store.droppedFiles = Array.from(files)
    store.showUploadPopup = true
  }
}

onMounted(() => {
  store.init()
  document.addEventListener('dragenter', onDocDragEnter)
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('dragleave', onDocDragLeave)
  document.addEventListener('drop', onDocDrop)
})

onUnmounted(() => {
  document.removeEventListener('dragenter', onDocDragEnter)
  document.removeEventListener('dragover', onDocDragOver)
  document.removeEventListener('dragleave', onDocDragLeave)
  document.removeEventListener('drop', onDocDrop)
})

function openImage(image: IImage) {
  store.lastSelectedId = image._id
  router.push(`/images/${image._id}`)
}

function onUploadClose() {
  store.showUploadPopup = false
  store.droppedFiles = []
}

function confirmDelete(image: IImage, force = false) {
  deleteTarget.value = image
  deleteForce.value = force
  showDeleteConfirm.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  await store.removeImage(deleteTarget.value._id, deleteForce.value)
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}


</script>
<template>
<div class="images-view">
  <UiLoader v-if="store.loading" />

  <template v-else>
    <ImagesGrid
      v-if="store.viewMode === 'grid'"
      @open="openImage"
    />
    <ImagesList
      v-else
      @open="openImage"
      @delete="confirmDelete"
    />
  </template>

  <ImageUploadPopup
    :show="store.showUploadPopup"
    :initialFiles="store.droppedFiles"
    @close="onUploadClose"
  />

  <ImageDeleteConfirm
    :show="showDeleteConfirm"
    :image="deleteTarget"
    :force="deleteForce"
    @confirm="doDelete"
    @cancel="cancelDelete"
  />

  <Teleport to="body">
    <div
      v-if="dragOver"
      class="images-view__dropzone"
      @drop="onDocDrop"
      @dragover="onDocDragOver"
    >
      <fa icon="upload" />
      <p>Drop files to upload</p>
    </div>
  </Teleport>
</div>
</template>
