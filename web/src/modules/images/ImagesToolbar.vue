<script setup lang="ts">

import { ref, watch } from 'vue'
import { useImagesStore } from '@/stores/images/images.store'
import { usePermission } from '@/composables/usePermission'

const store = useImagesStore()
const { hasPermission } = usePermission()

const searchInput = ref(store.phrase)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.setPhrase(val)
  }, 300)
})

function clearSearch() {
  searchInput.value = ''
  store.setPhrase('')
}

</script>
<template>
<div class="images-toolbar">
  <div class="images-toolbar__search">
    <UiInput
      :modelValue="searchInput"
      @update:modelValue="(v: string) => searchInput = v"
      placeholder="Search images..."
    />
    <a
      v-if="searchInput"
      href="#"
      class="images-toolbar__clear"
      @click.prevent="clearSearch"
    ><fa icon="times" /></a>
  </div>

  <div class="images-toolbar__view">
    <UiButton
      :class="{ 'accent': store.viewMode === 'grid' }"
      @click="store.setViewMode('grid')"
      v-tooltip="'<b>Grid</b> view'"
    ><fa icon="dice-four" /></UiButton>
    <UiButton
      :class="{ 'accent': store.viewMode === 'list' }"
      @click="store.setViewMode('list')"
      v-tooltip="'<b>List</b> view'"
    ><fa icon="list" /></UiButton>
  </div>

  <div class="images-toolbar__actions">
    <UiSwitch
      v-if="hasPermission('can-admin-images')"
      :modelValue="store.showDeleted"
      @update:modelValue="store.toggleShowDeleted()"
    >Deleted</UiSwitch>

    <UiButton
      v-if="hasPermission('control-images')"
      @click="store.showUploadPopup = true"
    ><fa icon="upload" /> Upload</UiButton>
  </div>

</div>
</template>
