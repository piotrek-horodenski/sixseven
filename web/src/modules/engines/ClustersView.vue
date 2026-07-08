<script setup lang="ts">

import { ref, onMounted } from 'vue'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { ICluster } from '@/stores/engines/engines.model'
import ClusterCard from './ClusterCard.vue'
import ClusterEditPopup from './ClusterEditPopup.vue'
import { EPopupSize } from '@/controls/controls.model'

const store = useEnginesStore()

const showEdit = ref(false)
const editTarget = ref<ICluster | null>(null)
const showDelete = ref(false)
const deleteTarget = ref<ICluster | null>(null)

onMounted(() => {
  store.init()
})

function openAdd() {
  editTarget.value = null
  showEdit.value = true
}

function openEdit(cluster: ICluster) {
  editTarget.value = cluster
  showEdit.value = true
}

function closeEdit() {
  showEdit.value = false
  editTarget.value = null
}

function openDelete(cluster: ICluster) {
  deleteTarget.value = cluster
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    store.deleteCluster(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

function cancelDelete() {
  showDelete.value = false
  deleteTarget.value = null
}

</script>
<template>
<div class="engines-view">
  <div class="engines-view__toolbar">
    <UiInput
      :modelValue="store.searchPhrase"
      @update:modelValue="(v: string) => store.searchPhrase = v"
      placeholder="Search clusters..."
    />
    <UiButton class="accent" @click="openAdd">
      <fa icon="plus" /> Add Cluster
    </UiButton>
  </div>

  <div class="engines-view__list">
    <ClusterCard
      v-for="cluster in store.filteredClusters"
      :key="cluster._id"
      :cluster="cluster"
      @edit="openEdit"
      @delete="openDelete"
    />
    <div v-if="!store.filteredClusters.length" class="engines-view__empty">
      <fa icon="network-wired" />
      <p>No clusters found</p>
    </div>
  </div>

  <ClusterEditPopup
    :show="showEdit"
    :cluster="editTarget"
    @close="closeEdit"
  />

  <UiPopup
    :show="showDelete"
    :size="EPopupSize.thin"
    :outsideClose="true"
    @update:show="cancelDelete"
  >
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="cancelDelete">
      <p class="ui-confirm__message">
        Are you sure you want to delete cluster <strong>{{ deleteTarget?.alias }}</strong>?
      </p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDelete">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
