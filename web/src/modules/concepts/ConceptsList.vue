<script setup lang="ts">

import type { IConcept } from '@/stores/concepts/concepts.model'

defineProps<{
  concepts: IConcept[]
  getProjectCount: (id: string) => number
}>()

const emit = defineEmits<{
  (event: 'open', concept: IConcept): void
  (event: 'edit', concept: IConcept): void
  (event: 'delete', concept: IConcept): void
}>()

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

</script>
<template>
<div class="concepts-list">
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Description</th>
        <th>Projects</th>
        <th>Created</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="concept in concepts"
        :key="concept._id"
        class="concepts-list__row"
        @click="emit('open', concept)"
      >
        <td class="concepts-list__name">{{ concept.name }}</td>
        <td class="concepts-list__description">{{ concept.description }}</td>
        <td>{{ getProjectCount(concept._id) }}</td>
        <td>{{ formatDate(concept.createdAt) }}</td>
        <td class="concepts-list__actions" @click.stop>
          <UiButton @click="emit('edit', concept)" v-tooltip="'Edit'">
            <fa icon="edit" />
          </UiButton>
          <UiButton @click="emit('delete', concept)" v-tooltip="'Delete'">
            <fa icon="trash" />
          </UiButton>
        </td>
      </tr>
    </tbody>
  </table>
</div>
</template>
