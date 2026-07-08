<script setup lang="ts">

import type { IConcept } from '@/stores/concepts/concepts.model'
import ConceptCard from './ConceptCard.vue'

defineProps<{
  concepts: IConcept[]
  getProjectCount: (id: string) => number
}>()

const emit = defineEmits<{
  (event: 'open', concept: IConcept): void
  (event: 'edit', concept: IConcept): void
  (event: 'delete', concept: IConcept): void
}>()

</script>
<template>
<div class="concepts-grid">
  <ConceptCard
    v-for="concept in concepts"
    :key="concept._id"
    :concept="concept"
    :projectCount="getProjectCount(concept._id)"
    @open="emit('open', $event)"
    @edit="emit('edit', $event)"
    @delete="emit('delete', $event)"
  />
</div>
</template>
