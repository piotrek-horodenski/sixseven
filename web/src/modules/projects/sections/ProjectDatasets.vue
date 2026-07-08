<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useDatasetsStore } from '@/stores/projects/datasets.store'
import { usePermission } from '@/composables/usePermission'
import type { IDataset } from '@/stores/projects/datasets.model'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const datasetsStore = useDatasetsStore()
const { hasPermission } = usePermission()

const canEdit = computed(() => hasPermission('edit-unreal-projects'))
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

const showAdd = ref(false)
const newDatasetLabel = ref('')
const showDelete = ref(false)
const deleteTarget = ref<IDataset | null>(null)

onMounted(() => {
  datasetsStore.init(projectId.value)
})

onUnmounted(() => {
  datasetsStore.cleanup()
})

function addDataset() {
  if (!newDatasetLabel.value.trim()) return
  datasetsStore.createDataset(projectId.value, newDatasetLabel.value.trim())
  newDatasetLabel.value = ''
  showAdd.value = false
}

function openDelete(dataset: IDataset) {
  deleteTarget.value = dataset
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    datasetsStore.deleteDataset(deleteTarget.value._id, deleteTarget.value.datasetId)
  }
  showDelete.value = false
  deleteTarget.value = null
}

</script>
<template>
<div class="project-datasets" v-if="project">
  <div class="project-datasets__toolbar">
    <UiButton v-if="canEdit" class="accent" @click="showAdd = true" :disabled="project.locked">
      <fa icon="plus" /> Add Dataset
    </UiButton>
  </div>

  <div class="project-datasets__list" v-if="datasetsStore.datasets.length">
    <div
      v-for="dataset in datasetsStore.datasets"
      :key="dataset._id"
      class="dataset-card"
    >
      <div class="board-card__name">{{ dataset.label || dataset.name }}</div>
      <div class="dataset-card__version">
        Version: {{ dataset.currentVersionId || dataset.versionId }}
      </div>
      <div class="board-card__actions" @click.stop>
        <UiButton v-if="canEdit" @click="openDelete(dataset)" :disabled="project.locked" v-tooltip="'Delete'">
          <fa icon="trash" />
        </UiButton>
      </div>
    </div>
  </div>

  <div v-else class="project-datasets__placeholder">
    <fa icon="database" />
    <h3>No Datasets</h3>
    <p>Create a dataset to import and bind tabular data to template instances.</p>
  </div>

  <!-- Add Dataset -->
  <UiPopup :show="showAdd" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAdd = false">
    <template #title>Add Dataset</template>
    <form class="concept-edit" @submit.prevent="addDataset">
      <UiInput :modelValue="newDatasetLabel" @update:modelValue="(v: string) => newDatasetLabel = v">Label</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newDatasetLabel.trim()">Add</UiButton>
        <UiButton @click="showAdd = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Delete Confirm -->
  <UiPopup :show="showDelete" :size="EPopupSize.thin" :outsideClose="true" @update:show="showDelete = false">
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="showDelete = false">
      <p class="ui-confirm__message">Delete dataset <strong>{{ deleteTarget?.label }}</strong>? This will also remove all versions and items.</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDelete">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
