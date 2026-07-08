<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import { useProjectsStore } from '@/stores/projects/projects.store'

const route = useRoute()
const conceptsStore = useConceptsStore()
const projectsStore = useProjectsStore()

const activeConcept = computed(() => route.params.concept as string)

const unassignedCount = computed(() => projectsStore.unassignedProjects.length)

</script>
<template>
<div class="projects-sidebar">
  <div class="projects-sidebar__title">Concepts</div>
  <ul class="projects-sidebar__list">
    <li
      v-for="concept in conceptsStore.filteredConcepts"
      :key="concept._id"
      :class="{ active: activeConcept === concept._id }"
    >
      <RouterLink :to="`/concepts/${concept._id}/projects`">
        {{ concept.name }}
        <span class="projects-sidebar__count">{{ projectsStore.getProjectCount(concept._id) }}</span>
      </RouterLink>
    </li>
    <li :class="{ active: activeConcept === 'unassigned' }">
      <RouterLink to="/concepts/unassigned/projects">
        Unassigned
        <span class="projects-sidebar__count">{{ unassignedCount }}</span>
      </RouterLink>
    </li>
  </ul>
</div>
</template>
