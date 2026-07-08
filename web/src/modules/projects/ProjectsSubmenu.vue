<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConceptsStore } from '@/stores/concepts/concepts.store'

const route = useRoute()
const conceptsStore = useConceptsStore()

const conceptName = computed(() => {
  const id = route.params.concept as string
  if (id === 'unassigned') return 'Unassigned'
  const concept = conceptsStore.concepts.find(c => c._id === id)
  return concept?.name || ''
})

</script>
<template>
<nav class="projects-submenu">
  <ul>
    <li>
      <RouterLink to="/concepts">
        <span class="icon"><fa icon="lightbulb" /></span>
        <span class="label">Concepts</span>
      </RouterLink>
    </li>
    <li v-if="conceptName" class="projects-submenu__separator">
      <fa icon="chevron-right" />
    </li>
    <li v-if="conceptName">
      <span class="projects-submenu__current">
        <span class="icon"><fa icon="folder" /></span>
        <span class="label">{{ conceptName }}</span>
      </span>
    </li>
  </ul>
</nav>
</template>
