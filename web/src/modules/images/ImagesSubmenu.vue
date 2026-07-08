<script setup lang="ts">

import { ref } from 'vue'
import { useImagesStore } from '@/stores/images/images.store'
import { usePermission } from '@/composables/usePermission'
import CollectionCreatePopup from './CollectionCreatePopup.vue'

const store = useImagesStore()
const { hasPermission } = usePermission()

const showNewCollection = ref(false)

function selectCollection(name: string) {
  if (name === '') {
    store.clearCollection()
  } else {
    store.setCollection(name)
  }
}

</script>
<template>
<nav class="images-submenu">
  <ul>
    <li>
      <a
        href="#"
        :class="{ 'active': !store.selectedCollection }"
        @click.prevent="selectCollection('')"
      >All</a>
    </li>
    <li
      v-for="col in store.collections"
      :key="col.name"
    >
      <a
        href="#"
        :class="{ 'active': store.selectedCollection === col.name }"
        @click.prevent="selectCollection(col.name)"
      >
        {{ col.name }}
        <span v-if="col.count !== undefined" class="images-submenu__count">{{ col.count }}</span>
      </a>
    </li>
    <li v-if="hasPermission('control-images')">
      <a
        href="#"
        class="images-submenu__add"
        @click.prevent="showNewCollection = true"
      ><fa icon="plus" /></a>
    </li>
  </ul>
  <CollectionCreatePopup
    :show="showNewCollection"
    @close="showNewCollection = false"
  />
</nav>
</template>
