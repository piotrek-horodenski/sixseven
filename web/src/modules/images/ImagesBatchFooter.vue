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
      {{ $t('images.selectedCount', store.selectedCount) }}
    </span>
    <a href="#" @click.prevent="store.deselectAll(); if (isBatchRoute) router.push('/images')">{{ $t('images.deselect') }}</a>
    <div class="images-batch-footer__spacer"></div>
    <UiButton class="accent" @click="toggleBatchEdit">
      <fa icon="edit" /> {{ $t('images.batchEdit') }}
    </UiButton>
    <UiButton @click="showDeleteConfirm = true">
      <fa icon="trash" /> {{ $t('images.deleteSelected') }}
    </UiButton>
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
