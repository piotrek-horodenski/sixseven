<script setup lang="ts">

import { ref, watch, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImagesStore } from '@/stores/images/images.store'
import { EPopupSize } from '@/controls/controls.model'

interface FileMetadata {
  title: string
  description: string
  tags: string
  collections: string
}

const props = defineProps<{
  show: boolean
  initialFiles?: File[]
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useImagesStore()
const { t } = useI18n()

const files = ref<File[]>([])
const currentIndex = ref(0)
const fileMetadata = reactive<Map<File, FileMetadata>>(new Map())
const uploadError = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const previewUrls = reactive<Map<File, string>>(new Map())

const currentFile = computed(() => files.value[currentIndex.value] || null)
const totalFiles = computed(() => files.value.length)

const currentMeta = computed(() => {
  if (!currentFile.value) return null
  return fileMetadata.get(currentFile.value) || null
})

const currentPreviewUrl = computed(() => {
  if (!currentFile.value) return null
  return previewUrls.get(currentFile.value) || null
})

function ensureMetadata(file: File) {
  if (!fileMetadata.has(file)) {
    fileMetadata.set(file, {
      title: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      tags: store.selectedTags.join(' '),
      collections: store.selectedCollection || '',
    })
  }
  if (!previewUrls.has(file)) {
    previewUrls.set(file, URL.createObjectURL(file))
  }
}

function updateMeta(field: keyof FileMetadata, value: string) {
  if (!currentFile.value) return
  const meta = fileMetadata.get(currentFile.value)
  if (meta) {
    meta[field] = value
  }
}

watch(() => props.show, (val) => {
  if (val) {
    // Clean up previous state
    cleanup()

    if (props.initialFiles?.length) {
      files.value = [...props.initialFiles]
      files.value.forEach(f => ensureMetadata(f))
    } else {
      files.value = []
    }
    currentIndex.value = 0
    uploadError.value = ''
    uploadProgress.value = 0
  }
})

function cleanup() {
  previewUrls.forEach(url => URL.revokeObjectURL(url))
  previewUrls.clear()
  fileMetadata.clear()
  files.value = []
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    const newFiles = Array.from(input.files)
    newFiles.forEach(f => ensureMetadata(f))
    files.value = [...files.value, ...newFiles]
    if (files.value.length === newFiles.length) {
      currentIndex.value = 0
    }
    input.value = ''
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const dropped = event.dataTransfer?.files
  if (dropped?.length) {
    const newFiles = Array.from(dropped)
    newFiles.forEach(f => ensureMetadata(f))
    files.value = [...files.value, ...newFiles]
    if (currentIndex.value === 0 && files.value.length === newFiles.length) {
      currentIndex.value = 0
    }
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
}

function removeFile(index: number) {
  const file = files.value[index]
  if (file) {
    fileMetadata.delete(file)
    const url = previewUrls.get(file)
    if (url) URL.revokeObjectURL(url)
    previewUrls.delete(file)
  }
  files.value = files.value.filter((_, i) => i !== index)
  if (currentIndex.value >= files.value.length) {
    currentIndex.value = Math.max(0, files.value.length - 1)
  }
}

async function uploadOne(skipReload = false) {
  if (!currentFile.value || !currentMeta.value) return
  uploading.value = true
  uploadError.value = ''

  try {
    const meta = currentMeta.value
    const collections = meta.collections
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    await store.upload(currentFile.value, {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      collections,
    }, skipReload)

    // Clean up this file
    const file = currentFile.value
    fileMetadata.delete(file)
    const url = previewUrls.get(file)
    if (url) URL.revokeObjectURL(url)
    previewUrls.delete(file)

    files.value = files.value.filter((_, i) => i !== currentIndex.value)
    uploadProgress.value++

    if (files.value.length === 0 && !skipReload) {
      close()
    } else {
      if (currentIndex.value >= files.value.length) {
        currentIndex.value = 0
      }
    }
  } catch (err: any) {
    uploadError.value = err.message || t('images.uploadFailed')
  } finally {
    uploading.value = false
  }
}

async function uploadCurrent() {
  await uploadOne(false)
}

async function uploadAll() {
  while (files.value.length > 0) {
    currentIndex.value = 0
    const isLast = files.value.length === 1
    await uploadOne(!isLast)
    if (uploadError.value) break
  }
  if (!uploadError.value) {
    await store.reload()
    close()
  }
}

function close() {
  cleanup()
  emit('close')
}

</script>
<template>
<UiPopup
  :show="show"
  :size="EPopupSize.wide"
  :outsideClose="!uploading"
  @update:show="close"
>
  <template #title>
    {{ $t('images.uploadImages') }}
    <span v-if="totalFiles > 0"> ({{ $t('images.filesCount', totalFiles) }})</span>
  </template>

  <div class="image-upload">
    <div
      v-if="!files.length"
      class="image-upload__dropzone"
      @drop="onDrop"
      @dragover="onDragOver"
    >
      <fa icon="upload" />
      <p>{{ $t('images.dropHere') }}</p>
      <p>{{ $t('images.or') }}</p>
      <label class="image-upload__file-label">
        <UiButton @click="($refs.fileInput as HTMLInputElement)?.click()">{{ $t('images.chooseFiles') }}</UiButton>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          style="display: none"
          @change="onFileSelect"
        />
      </label>
    </div>

    <template v-else>
      <div class="image-upload__files">
        <div
          v-for="(file, index) in files"
          :key="index"
          class="image-upload__file-item"
          :class="{ 'image-upload__file-item--active': index === currentIndex }"
          @click="currentIndex = index"
        >
          <span>{{ file.name }}</span>
          <a href="#" @click.stop.prevent="removeFile(index)"><fa icon="times" /></a>
        </div>
        <label class="image-upload__add-more">
          <a href="#" @click.prevent="($refs.fileInputMore as HTMLInputElement)?.click()">
            <fa icon="plus" /> {{ $t('images.addMore') }}
          </a>
          <input
            ref="fileInputMore"
            type="file"
            accept="image/*"
            multiple
            style="display: none"
            @change="onFileSelect"
          />
        </label>
      </div>

      <div class="image-upload__form" v-if="currentFile && currentMeta">
        <div class="image-upload__preview" v-if="currentPreviewUrl">
          <img :src="currentPreviewUrl" :alt="currentFile.name" />
        </div>

        <UiInput
          :modelValue="currentMeta.title"
          @update:modelValue="(v: string) => updateMeta('title', v)"
        >{{ $t('images.imageTitle') }}</UiInput>

        <UiTextarea
          :modelValue="currentMeta.description"
          @update:modelValue="(v: string) => updateMeta('description', v)"
        >{{ $t('images.description') }}</UiTextarea>

        <UiInput
          :modelValue="currentMeta.tags"
          @update:modelValue="(v: string) => updateMeta('tags', v)"
        >{{ $t('images.tagsUploadLabel') }}</UiInput>

        <UiInput
          :modelValue="currentMeta.collections"
          @update:modelValue="(v: string) => updateMeta('collections', v)"
        >{{ $t('images.collectionsUploadLabel') }}</UiInput>

        <UiMessage v-if="uploadError" type="error">{{ uploadError }}</UiMessage>

        <div class="image-upload__actions">
          <UiButton
            class="accent"
            :loading="uploading"
            :disabled="!currentMeta.tags.trim()"
            @click="uploadCurrent"
          >{{ totalFiles > 1 ? $t('images.uploadCurrent') : $t('images.upload') }}</UiButton>
          <UiButton
            v-if="totalFiles > 1"
            :loading="uploading"
            :disabled="!currentMeta.tags.trim()"
            @click="uploadAll"
          >{{ $t('images.uploadAll') }} ({{ totalFiles }})</UiButton>
          <UiButton @click="close" :disabled="uploading">{{ $t('common.cancel') }}</UiButton>
        </div>
      </div>
    </template>
  </div>
</UiPopup>
</template>
