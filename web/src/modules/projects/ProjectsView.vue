<script setup lang="ts">

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import type { IProject } from '@/stores/projects/projects.model'
import ProjectCard from './ProjectCard.vue'
import ProjectEditPopup from './ProjectEditPopup.vue'
import ProjectDeleteConfirm from './ProjectDeleteConfirm.vue'

const route = useRoute()
const router = useRouter()
const store = useProjectsStore()
const conceptsStore = useConceptsStore()

const showEdit = ref(false)
const editTarget = ref<IProject | null>(null)
const showDelete = ref(false)
const deleteTarget = ref<IProject | null>(null)

const conceptId = computed(() => route.params.concept as string)

const filteredProjects = computed(() => {
  return store.projectsByConcept(conceptId.value)
})

onMounted(() => {
  conceptsStore.init()
  store.init()
})

function openAdd() {
  editTarget.value = null
  showEdit.value = true
}

function openEdit(project: IProject) {
  editTarget.value = project
  showEdit.value = true
}

function closeEdit() {
  showEdit.value = false
  editTarget.value = null
}

function openProject(project: IProject) {
  router.push(`/concepts/${conceptId.value}/projects/${project._id}/overview`)
}

function openDelete(project: IProject) {
  deleteTarget.value = project
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    store.deleteProject(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

function cancelDelete() {
  showDelete.value = false
  deleteTarget.value = null
}

function lockProject(project: IProject) {
  store.lockProject(project._id)
}

function unlockProject(project: IProject) {
  store.unlockProject(project._id)
}

</script>
<template>
<div class="projects-view">
  <div class="projects-view__toolbar">
    <UiInput
      :modelValue="store.searchPhrase"
      @update:modelValue="(v: string) => store.searchPhrase = v"
      placeholder="Search projects..."
    />
    <UiButton class="accent" @click="openAdd">
      <fa icon="plus" /> Add Project
    </UiButton>
  </div>

  <div class="projects-view__list">
    <ProjectCard
      v-for="project in filteredProjects"
      :key="project._id"
      :project="project"
      @open="openProject"
      @edit="openEdit"
      @delete="openDelete"
      @lock="lockProject"
      @unlock="unlockProject"
    />
    <div v-if="!filteredProjects.length" class="projects-view__empty">
      <fa icon="project-diagram" />
      <p>No projects found</p>
    </div>
  </div>

  <ProjectEditPopup
    :show="showEdit"
    :project="editTarget"
    :conceptId="conceptId"
    @close="closeEdit"
  />

  <ProjectDeleteConfirm
    :show="showDelete"
    :project="deleteTarget"
    @confirm="doDelete"
    @cancel="cancelDelete"
  />
</div>
</template>
