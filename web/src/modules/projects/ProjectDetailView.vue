<script setup lang="ts">

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useConceptsStore } from '@/stores/concepts/concepts.store'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const conceptsStore = useConceptsStore()

const projectId = computed(() => route.params.projectId as string)
const conceptId = computed(() => route.params.concept as string)

const project = computed(() => {
  return projectsStore.projects.find(p => p._id === projectId.value)
})

const conceptName = computed(() => {
  if (conceptId.value === 'unassigned') return 'Unassigned'
  const concept = conceptsStore.concepts.find(c => c._id === conceptId.value)
  return concept?.name || ''
})

const tabs = [
  { name: 'project-overview', label: 'Overview', icon: 'info-circle' },
  { name: 'project-studio', label: 'Studio', icon: 'camera' },
  { name: 'project-boards', label: 'Boards', icon: 'th-large' },
  { name: 'project-playlists', label: 'Playlists', icon: 'list-ol' },
  { name: 'project-datasets', label: 'Datasets', icon: 'database' },
  { name: 'project-environment', label: 'Environment', icon: 'cogs' },
]

const activeTab = computed(() => route.name as string)

function navigateTab(tabName: string) {
  router.push({ name: tabName, params: route.params })
}

onMounted(() => {
  conceptsStore.init()
  projectsStore.init()
})

</script>
<template>
<div class="project-detail" v-if="project">
  <div class="project-detail__header">
    <div class="project-detail__title">
      <span v-if="project.locked" class="project-detail__lock"><fa icon="lock" /></span>
      <h2>{{ project.displayName || project.name }}</h2>
      <span class="project-detail__concept-link">
        in
        <RouterLink :to="`/concepts/${conceptId}/projects`">{{ conceptName }}</RouterLink>
      </span>
    </div>
  </div>

  <nav class="project-detail__tabs">
    <ul>
      <li
        v-for="tab in tabs"
        :key="tab.name"
        :class="{ active: activeTab === tab.name }"
      >
        <a href="#" @click.prevent="navigateTab(tab.name)">
          <fa :icon="tab.icon" />
          <span>{{ tab.label }}</span>
        </a>
      </li>
    </ul>
  </nav>

  <div class="project-detail__content">
    <RouterView />
  </div>
</div>
<div v-else class="project-detail__not-found">
  <fa icon="exclamation-triangle" />
  <p>Project not found</p>
</div>
</template>
