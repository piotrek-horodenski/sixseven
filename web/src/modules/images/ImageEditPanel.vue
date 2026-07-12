<script setup lang="ts">

import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images/images.store'
import { usePermission } from '@/composables/usePermission'
import { getPreviewUrl, getImageUrl } from '@/stores/images/images.api'
import type { IImage } from '@/stores/images/images.model'
import { EPopupSize } from '@/controls/controls.model'
import type { ISelectOption } from '@/controls/controls.model'
import { computed } from 'vue'

const store = useImagesStore()
const route = useRoute()
const router = useRouter()
const { hasPermission } = usePermission()

const title = ref('')
const description = ref('')
const selectedTagNames = ref<string[]>([])
const selectedCollectionNames = ref<string[]>([])

const tagOptions = computed<ISelectOption<string>[]>(() =>
  store.sortedTags.map(t => ({ label: t.name, value: t.name }))
)

const collectionOptions = computed<ISelectOption<string>[]>(() =>
  store.collections.map(c => ({ label: c.name, value: c.name }))
)
const loading = ref(false)
const saving = ref(false)
const saved = ref(false)
const showDeleteConfirm = ref(false)
const forceDelete = ref(false)

const image = ref<IImage | null>(null)

async function loadImage() {
  const id = route.params.id as string
  if (!id) return

  loading.value = true
  image.value = null

  // Try to find in store first
  const found = store.images.find(img => img._id === id)
  if (found) {
    setImage(found)
    loading.value = false
  } else {
    // Wait for store init then try again
    await store.init()
    const foundAfter = store.images.find(img => img._id === id)
    if (foundAfter) setImage(foundAfter)
    loading.value = false
  }
}

function setImage(img: IImage) {
  image.value = img
  title.value = img.title || ''
  description.value = img.description || ''
  selectedTagNames.value = img.tags?.map(t => t.name) ?? []
  selectedCollectionNames.value = img.collections?.map(c => c.name) ?? []
}

watch(() => route.params.id, loadImage, { immediate: true })

function close() {
  router.push('/images')
}

async function save() {
  if (!image.value || saving.value) return
  saving.value = true
  try {
    await store.updateImageData(image.value._id, {
      title: title.value,
      description: description.value,
      tags: selectedTagNames.value.join(' '),
      collections: selectedCollectionNames.value,
    })

    // Refresh image data
    const updated = store.images.find(img => img._id === image.value!._id)
    if (updated) setImage(updated)

    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } finally {
    saving.value = false
  }
}

async function doDelete() {
  if (!image.value) return
  await store.removeImage(image.value._id, forceDelete.value)
  showDeleteConfirm.value = false
  close()
}

async function restore() {
  if (!image.value) return
  await store.restoreImage(image.value._id)
  const updated = store.images.find(img => img._id === image.value!._id)
  if (updated) setImage(updated)
}

function confirmDelete(force: boolean) {
  forceDelete.value = force
  showDeleteConfirm.value = true
}

function openOriginal() {
  if (image.value) window.open(getImageUrl(image.value._id), '_blank')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

</script>
<template>
<div class="image-edit-panel">
  <UiLoader v-if="loading" />
  <template v-else-if="image">
  <div class="image-edit-panel__header">
    <h3>{{ $t('images.editImage') }}</h3>
    <span v-if="saved" class="image-edit-panel__saved"><fa icon="check" /> {{ $t('common.saved') }}</span>
    <a href="#" @click.prevent="close"><fa icon="times" /></a>
  </div>

  <div class="image-edit-panel__preview">
    <img
      :src="getPreviewUrl(image._id)"
      :alt="image.title"
      :width="image.meta?.width"
      :height="image.meta?.height"
      @dblclick="openOriginal"
    />
  </div>

  <div class="image-edit-panel__meta">
    <span v-if="image.meta">
      {{ image.meta.width }} x {{ image.meta.height }} &middot;
      {{ formatSize(image.meta.fileSize) }} &middot;
      {{ image.meta.originalName }}
    </span>
  </div>

  <form class="image-edit-panel__form" @submit.prevent="save">
    <UiInput
      :modelValue="title"
      @update:modelValue="(v: string) => title = v"
    >{{ $t('images.imageTitle') }}</UiInput>

    <UiTextarea
      :modelValue="description"
      @update:modelValue="(v: string) => description = v"
    >{{ $t('images.description') }}</UiTextarea>

    <UiChipInput
      v-model="selectedTagNames"
      :options="tagOptions"
      :freeText="true"
    >{{ $t('images.tags') }}</UiChipInput>

    <UiChipInput
      v-model="selectedCollectionNames"
      :options="collectionOptions"
      :freeText="true"
      class="ui-tag-input--collections"
    >{{ $t('images.collections') }}</UiChipInput>

    <div class="image-edit-panel__actions" v-if="hasPermission('control-images')">
      <UiButton class="accent" type="submit" :loading="saving">{{ $t('common.save') }}</UiButton>

      <template v-if="image.isDeleted">
        <UiButton @click="restore">
          <fa icon="recycle" /> {{ $t('images.restore') }}
        </UiButton>
        <UiButton
          v-if="hasPermission('can-admin-images')"
          @click="confirmDelete(true)"
        >
          <fa icon="trash" /> {{ $t('images.permanentlyDelete') }}
        </UiButton>
      </template>
      <template v-else>
        <UiButton @click="confirmDelete(false)">
          <fa icon="trash" /> {{ $t('common.delete') }}
        </UiButton>
      </template>
    </div>
  </form>

  <UiPopup
    :show="showDeleteConfirm"
    :size="EPopupSize.thin"
    :outsideClose="true"
    @update:show="showDeleteConfirm = false"
  >
    <template #title>{{ $t('images.confirmDelete') }}</template>
    <form class="ui-confirm" @submit.prevent="showDeleteConfirm = false">
      <p class="ui-confirm__message">
        {{ forceDelete
          ? $t('images.confirmForceDeleteMsg')
          : $t('images.confirmDeleteMsg')
        }}
      </p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">{{ $t('common.cancel') }}</UiButton>
        <UiButton @click="doDelete">{{ $t('images.yesDelete') }}</UiButton>
      </div>
    </form>
  </UiPopup>
  </template>
</div>
</template>
