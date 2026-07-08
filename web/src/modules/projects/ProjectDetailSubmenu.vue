<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import { useProjectsStore } from '@/stores/projects/projects.store'

const route = useRoute()
const conceptsStore = useConceptsStore()
const projectsStore = useProjectsStore()

const conceptId = computed(() => route.params.concept as string)
const projectId = computed(() => route.params.projectId as string)

const conceptName = computed(() => {
  if (conceptId.value === 'unassigned') return 'Unassigned'
  const concept = conceptsStore.concepts.find(c => c._id === conceptId.value)
  return concept?.name || ''
})

const projectName = computed(() => {
  const project = projectsStore.projects.find(p => p._id === projectId.value)
  return project?.displayName || project?.name || ''
})

</script>
<template>
<nav class="project-detail-submenu">
  <ul>
    <li>
      <RouterLink to="/concepts">
        <span class="icon"><fa icon="lightbulb" /></span>
        <span class="label">Concepts</span>
      </RouterLink>
    </li>
    <li class="project-detail-submenu__separator">
      <fa icon="chevron-right" />
    </li>
    <li>
      <RouterLink :to="`/concepts/${conceptId}/projects`">
        <span class="icon"><fa icon="folder" /></span>
        <span class="label">{{ conceptName }}</span>
      </RouterLink>
    </li>
    <li v-if="projectName" class="project-detail-submenu__separator">
      <fa icon="chevron-right" />
    </li>
    <li v-if="projectName">
      <span class="project-detail-submenu__current">
        <span class="icon"><fa icon="project-diagram" /></span>
        <span class="label">{{ projectName }}</span>
      </span>
    </li>
  </ul>
</nav>
</template>
