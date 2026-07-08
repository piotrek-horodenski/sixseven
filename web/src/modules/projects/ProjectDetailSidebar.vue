<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useEnginesStore } from '@/stores/engines/engines.store'

const route = useRoute()
const projectsStore = useProjectsStore()
const enginesStore = useEnginesStore()

const projectId = computed(() => route.params.projectId as string)

const project = computed(() => {
  return projectsStore.projects.find(p => p._id === projectId.value)
})

const envLabel = computed(() => {
  if (!project.value?.env) return 'None'
  if (project.value.type === 'cluster') {
    const cluster = enginesStore.clusters.find(c => c._id === project.value!.env)
    return cluster?.alias || project.value.env
  }
  const engine = enginesStore.engines.find(e => e._id === project.value!.env)
  return engine?.alias || project.value.env
})

function toggleLock() {
  if (!project.value) return
  if (project.value.locked) {
    projectsStore.unlockProject(project.value._id)
  } else {
    projectsStore.lockProject(project.value._id)
  }
}

</script>
<template>
<div class="project-detail-sidebar" v-if="project">
  <div class="project-detail-sidebar__title">Project Info</div>

  <div class="project-detail-sidebar__section">
    <div class="project-detail-sidebar__field">
      <label>Name</label>
      <span>{{ project.name }}</span>
    </div>
    <div v-if="project.displayName" class="project-detail-sidebar__field">
      <label>Display Name</label>
      <span>{{ project.displayName }}</span>
    </div>
    <div class="project-detail-sidebar__field">
      <label>Type</label>
      <span class="project-detail-sidebar__badge" :class="'project-detail-sidebar__badge--' + project.type">
        {{ project.type }}
      </span>
    </div>
    <div class="project-detail-sidebar__field">
      <label>Environment</label>
      <span>{{ envLabel }}</span>
    </div>
    <div v-if="project.map" class="project-detail-sidebar__field">
      <label>Map</label>
      <span>{{ project.map }}</span>
    </div>
    <div v-if="project.source" class="project-detail-sidebar__field">
      <label>Source</label>
      <span>{{ project.source }}</span>
    </div>
  </div>

  <div class="project-detail-sidebar__actions">
    <UiButton @click="toggleLock" :class="project.locked ? 'danger' : ''">
      <fa :icon="project.locked ? 'lock' : 'unlock'" />
      {{ project.locked ? 'Unlock' : 'Lock' }}
    </UiButton>
  </div>
</div>
</template>
