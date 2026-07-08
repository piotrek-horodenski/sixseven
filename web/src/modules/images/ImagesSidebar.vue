<script setup lang="ts">

import { ref } from 'vue'
import { useImagesStore } from '@/stores/images/images.store'
import { usePermission } from '@/composables/usePermission'

const store = useImagesStore()
const { hasPermission } = usePermission()

const tagsSearch = ref('')
const showNewTag = ref(false)
const newTagName = ref('')
const confirmingTag = ref<string | null>(null)

const filteredTags = computed(() => {
  const q = tagsSearch.value.trim().toLowerCase()
  const sorted = store.sortedTags
  if (!q) return sorted
  return sorted.filter(tag => tag.name.toLowerCase().includes(q))
})

import { computed } from 'vue'

function toggleTag(name: string) {
  store.toggleTag(name)
}

async function createTag() {
  const name = newTagName.value.trim().toLowerCase()
  if (!name) return
  await store.addTag(name)
  newTagName.value = ''
  showNewTag.value = false
}

async function confirmDeleteTag(id: string) {
  await store.removeTag(id)
  confirmingTag.value = null
}

</script>
<template>
<div class="images-sidebar">
  <div class="images-sidebar__header">
    <h3>Tags</h3>
    <a
      v-if="store.selectedTags.length"
      href="#"
      class="images-sidebar__clear"
      @click.prevent="store.clearTags()"
    >Clear tags</a>
  </div>

  <div class="images-sidebar__search">
    <UiInput
      :modelValue="tagsSearch"
      @update:modelValue="(v: string) => tagsSearch = v"
      placeholder="Filter tags..."
    />
  </div>

  <ul class="images-sidebar__list">
    <li
      v-for="tag in filteredTags"
      :key="tag.name"
      class="images-sidebar__tag"
      :class="{ 'images-sidebar__tag--active': store.selectedTags.includes(tag.name) }"
    >
      <a href="#" @click.prevent="toggleTag(tag.name)">
        <span class="images-sidebar__tag-name">{{ tag.name }}</span>
        <span class="images-sidebar__tag-count">{{ tag.count }}</span>
      </a>
      <button
        v-if="hasPermission('can-admin-images') && tag._id"
        class="images-sidebar__tag-remove"
        @click.stop="confirmingTag === tag._id ? confirmDeleteTag(tag._id!) : (confirmingTag = tag._id!)"
      >
        <fa :icon="confirmingTag === tag._id ? 'check' : 'times'" />
      </button>
    </li>
    <li v-if="!filteredTags.length" class="images-sidebar__empty">
      No tags found
    </li>
  </ul>

  <div v-if="hasPermission('control-images')" class="images-sidebar__add">
    <a
      v-if="!showNewTag"
      href="#"
      @click.prevent="showNewTag = true"
    ><fa icon="plus" /> Add tag</a>
    <form
      v-else
      @submit.prevent="createTag"
      class="images-sidebar__new-form"
    >
      <UiInput
        :modelValue="newTagName"
        @update:modelValue="(v: string) => newTagName = v"
        placeholder="Tag name..."
      />
      <UiButton type="submit" :disabled="!newTagName.trim()">Add</UiButton>
      <a href="#" @click.prevent="showNewTag = false"><fa icon="times" /></a>
    </form>
  </div>
</div>
</template>
