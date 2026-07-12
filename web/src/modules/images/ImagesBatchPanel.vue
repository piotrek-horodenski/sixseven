<script setup lang="ts">

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images/images.store'
import { EPopupSize } from '@/controls/controls.model'

const store = useImagesStore()
const router = useRouter()

const tagsToAdd = ref('')
const tagsToRemove = ref<string[]>([])
const collectionsToAdd = ref('')
const collectionsToRemove = ref<string[]>([])
const saving = ref(false)
const showDeleteConfirm = ref(false)

const unionTags = computed(() => {
  const tagSet = new Set<string>()
  for (const img of store.selectedImages) {
    for (const tag of img.tags || []) {
      tagSet.add(tag.name)
    }
  }
  return [...tagSet].sort()
})

const unionCollections = computed(() => {
  const colSet = new Set<string>()
  for (const img of store.selectedImages) {
    for (const col of img.collections || []) {
      colSet.add(col.name)
    }
  }
  return [...colSet].sort()
})

function toggleRemoveTag(name: string) {
  const idx = tagsToRemove.value.indexOf(name)
  if (idx === -1) {
    tagsToRemove.value = [...tagsToRemove.value, name]
  } else {
    tagsToRemove.value = tagsToRemove.value.filter(t => t !== name)
  }
}

function toggleRemoveCollection(name: string) {
  const idx = collectionsToRemove.value.indexOf(name)
  if (idx === -1) {
    collectionsToRemove.value = [...collectionsToRemove.value, name]
  } else {
    collectionsToRemove.value = collectionsToRemove.value.filter(c => c !== name)
  }
}

async function apply() {
  saving.value = true
  try {
    const addTags = tagsToAdd.value
      .split(' ')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0)
      .map(name => ({ name }))

    const removeTags = tagsToRemove.value.map(name => ({ name }))

    const addCols = collectionsToAdd.value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(name => ({ name }))

    const removeCols = collectionsToRemove.value.map(name => ({ name }))

    await store.batchUpdate({
      ids: [...store.selectedIds],
      tagsToAdd: addTags,
      tagsToRemove: removeTags,
      collectionsToAdd: addCols,
      collectionsToRemove: removeCols,
    })

    tagsToAdd.value = ''
    tagsToRemove.value = []
    collectionsToAdd.value = ''
    collectionsToRemove.value = []
  } finally {
    saving.value = false
  }
}

async function doBatchDelete() {
  await store.batchDelete([...store.selectedIds])
  showDeleteConfirm.value = false
  router.push('/images')
}

function close() {
  router.push('/images')
}

</script>
<template>
<div class="images-batch-panel" v-if="store.selectedCount > 0">
  <div class="images-batch-panel__header">
    <h3>{{ $t('images.batchEdit') }} ({{ store.selectedCount }})</h3>
    <a href="#" @click.prevent="close"><fa icon="times" /></a>
  </div>

  <div class="images-batch-panel__form">
    <div class="images-batch-panel__section">
      <h5>{{ $t('images.addTags') }}</h5>
      <UiInput
        :modelValue="tagsToAdd"
        @update:modelValue="(v: string) => tagsToAdd = v"
        :placeholder="$t('images.tagsToAddPlaceholder')"
      />
    </div>

    <div class="images-batch-panel__section" v-if="unionTags.length">
      <h5>{{ $t('images.removeTags') }}</h5>
      <div class="images-batch-panel__chips">
        <span
          v-for="tag in unionTags"
          :key="tag"
          class="images-batch-panel__chip"
          :class="{ 'images-batch-panel__chip--marked': tagsToRemove.includes(tag) }"
          @click="toggleRemoveTag(tag)"
        >{{ tag }} <fa icon="times" /></span>
      </div>
    </div>

    <div class="images-batch-panel__section">
      <h5>{{ $t('images.addCollections') }}</h5>
      <UiInput
        :modelValue="collectionsToAdd"
        @update:modelValue="(v: string) => collectionsToAdd = v"
        :placeholder="$t('images.collectionsToAddPlaceholder')"
      />
    </div>

    <div class="images-batch-panel__section" v-if="unionCollections.length">
      <h5>{{ $t('images.removeCollections') }}</h5>
      <div class="images-batch-panel__chips">
        <span
          v-for="col in unionCollections"
          :key="col"
          class="images-batch-panel__chip"
          :class="{ 'images-batch-panel__chip--marked': collectionsToRemove.includes(col) }"
          @click="toggleRemoveCollection(col)"
        >{{ col }} <fa icon="times" /></span>
      </div>
    </div>

    <div class="images-batch-panel__actions">
      <UiButton class="accent" :loading="saving" @click="apply">{{ $t('images.applyChanges') }}</UiButton>
      <UiButton @click="showDeleteConfirm = true">
        <fa icon="trash" /> {{ $t('images.deleteSelected') }}
      </UiButton>
    </div>
  </div>

  <UiPopup
    :show="showDeleteConfirm"
    :size="EPopupSize.thin"
    :outsideClose="true"
    @update:show="showDeleteConfirm = false"
  >
    <template #title>{{ $t('images.confirmBatchDelete') }}</template>
    <form class="ui-confirm" @submit.prevent="showDeleteConfirm = false">
      <p class="ui-confirm__message">
        {{ $t('images.confirmBatchDeleteMsg', store.selectedCount) }}
      </p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">{{ $t('common.cancel') }}</UiButton>
        <UiButton @click="doBatchDelete">{{ $t('images.yesDeleteAll') }}</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
