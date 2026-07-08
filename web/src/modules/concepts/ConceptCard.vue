<script setup lang="ts">

import { ref } from 'vue'
import type { IConcept } from '@/stores/concepts/concepts.model'

const props = defineProps<{
  concept: IConcept
  projectCount: number
}>()

const emit = defineEmits<{
  (event: 'open', concept: IConcept): void
  (event: 'edit', concept: IConcept): void
  (event: 'delete', concept: IConcept): void
}>()

const showMenu = ref(false)

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function menuAction(action: string) {
  showMenu.value = false
  switch (action) {
    case 'edit': emit('edit', props.concept); break
    case 'delete': emit('delete', props.concept); break
  }
}

</script>
<template>
<div class="concept-card" @click="emit('open', concept)">
  <div class="concept-card__info">
    <div class="concept-card__name">{{ concept.name }}</div>
    <div v-if="concept.description" class="concept-card__description">{{ concept.description }}</div>
  </div>
  <div class="concept-card__details">
    <span class="concept-card__detail">
      <fa icon="project-diagram" /> {{ projectCount }} project{{ projectCount !== 1 ? 's' : '' }}
    </span>
  </div>
  <div class="concept-card__actions" @click.stop>
    <div class="concept-card__menu-wrapper">
      <UiButton @click="toggleMenu" v-tooltip="'<b>Actions</b>'">
        <fa icon="ellipsis-v" />
      </UiButton>
      <div v-if="showMenu" class="concept-card__dropdown" @click.stop>
        <a href="#" @click.prevent="menuAction('edit')"><fa icon="edit" /> Edit</a>
        <a href="#" @click.prevent="menuAction('delete')"><fa icon="trash" /> Delete</a>
      </div>
    </div>
  </div>
</div>
</template>
