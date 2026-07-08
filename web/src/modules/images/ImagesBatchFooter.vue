<script setup lang="ts">

import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images/images.store'
import { EPopupSize } from '@/controls/controls.model'

const store = useImagesStore()
const route = useRoute()
const router = useRouter()
const showDeleteConfirm = ref(false)

const isBatchRoute = computed(() => route.name === 'images-batch')

function toggleBatchEdit() {
  if (isBatchRoute.value) {
    router.push('/images')
  } else {
    router.push('/images/batch')
  }
}

async function doBatchDelete() {
  await store.batchDelete([...store.selectedIds])
  showDeleteConfirm.value = false
  if (isBatchRoute.value) router.push('/images')
}

</script>
<template>
<div class="images-batch-footer" v-if="store.selectedCount > 0">
  <div class="images-batch-footer__bar">
    <span class="images-batch-footer__count">
      {{ store.selectedCount }} image{{ store.selectedCount > 1 ? 's' : '' }} selected
    </span>
    <a href="#" @click.prevent="store.deselectAll(); if (isBatchRoute) router.push('/images')">Deselect</a>
    <div class="images-batch-footer__spacer"></div>
    <UiButton class="accent" @click="toggleBatchEdit">
      <fa icon="edit" /> Batch Edit
    </UiButton>
    <UiButton @click="showDeleteConfirm = true">
      <fa icon="trash" /> Delete Selected
    </UiButton>
  </div>

  <UiPopup
    :show="showDeleteConfirm"
    :size="EPopupSize.thin"
    :outsideClose="true"
    @update:show="showDeleteConfirm = false"
  >
    <template #title>Confirm Batch Delete</template>
    <form class="ui-confirm" @submit.prevent="showDeleteConfirm = false">
      <p class="ui-confirm__message">
        Are you sure you want to delete {{ store.selectedCount }} image{{ store.selectedCount > 1 ? 's' : '' }}?
      </p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doBatchDelete">Yes, delete all</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
