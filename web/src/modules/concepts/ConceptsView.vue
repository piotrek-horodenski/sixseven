<script setup lang="ts">

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import { useProjectsStore } from '@/stores/projects/projects.store'
import type { IConcept } from '@/stores/concepts/concepts.model'
import ConceptsGrid from './ConceptsGrid.vue'
import ConceptsList from './ConceptsList.vue'
import ConceptEditPopup from './ConceptEditPopup.vue'
import ConceptDeleteConfirm from './ConceptDeleteConfirm.vue'

const store = useConceptsStore()
const projectsStore = useProjectsStore()
const router = useRouter()

const viewMode = ref<'grid' | 'list'>('grid')
const showEdit = ref(false)
const editTarget = ref<IConcept | null>(null)
const showDelete = ref(false)
const deleteTarget = ref<IConcept | null>(null)

onMounted(() => {
  store.init()
  projectsStore.init()
})

function openAdd() {
  editTarget.value = null
  showEdit.value = true
}

function openEdit(concept: IConcept) {
  editTarget.value = concept
  showEdit.value = true
}

function closeEdit() {
  showEdit.value = false
  editTarget.value = null
}

function openConcept(concept: IConcept) {
  router.push(`/concepts/${concept._id}/projects`)
}

function openDelete(concept: IConcept) {
  deleteTarget.value = concept
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    store.deleteConcept(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

function cancelDelete() {
  showDelete.value = false
  deleteTarget.value = null
}

function getProjectCount(conceptId: string): number {
  return projectsStore.getProjectCount(conceptId)
}

</script>
<template>
<div class="concepts-view">
  <div class="concepts-view__toolbar">
    <UiInput
      :modelValue="store.searchPhrase"
      @update:modelValue="(v: string) => store.searchPhrase = v"
      placeholder="Search concepts..."
    />
    <div class="concepts-view__toolbar-actions">
      <UiButton :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" v-tooltip="'Grid view'">
        <fa icon="th" />
      </UiButton>
      <UiButton :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" v-tooltip="'List view'">
        <fa icon="list" />
      </UiButton>
      <UiButton class="accent" @click="openAdd">
        <fa icon="plus" /> Add Concept
      </UiButton>
    </div>
  </div>

  <ConceptsGrid
    v-if="viewMode === 'grid'"
    :concepts="store.filteredConcepts"
    :getProjectCount="getProjectCount"
    @open="openConcept"
    @edit="openEdit"
    @delete="openDelete"
  />

  <ConceptsList
    v-else
    :concepts="store.filteredConcepts"
    :getProjectCount="getProjectCount"
    @open="openConcept"
    @edit="openEdit"
    @delete="openDelete"
  />

  <div v-if="!store.filteredConcepts.length" class="concepts-view__empty">
    <fa icon="lightbulb" />
    <p>No concepts found</p>
  </div>

  <ConceptEditPopup
    :show="showEdit"
    :concept="editTarget"
    @close="closeEdit"
  />

  <ConceptDeleteConfirm
    :show="showDelete"
    :concept="deleteTarget"
    @confirm="doDelete"
    @cancel="cancelDelete"
  />
</div>
</template>
