<script setup lang="ts">

import { ref } from 'vue'
import type { IProject } from '@/stores/projects/projects.model'

const props = defineProps<{
  project: IProject
}>()

const emit = defineEmits<{
  (event: 'open', project: IProject): void
  (event: 'edit', project: IProject): void
  (event: 'delete', project: IProject): void
  (event: 'lock', project: IProject): void
  (event: 'unlock', project: IProject): void
}>()

const showMenu = ref(false)

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function menuAction(action: string) {
  showMenu.value = false
  switch (action) {
    case 'edit': emit('edit', props.project); break
    case 'delete': emit('delete', props.project); break
    case 'lock': emit('lock', props.project); break
    case 'unlock': emit('unlock', props.project); break
  }
}

</script>
<template>
<div class="project-card" @click="emit('open', project)">
  <div class="project-card__info">
    <div class="project-card__name">
      <span v-if="project.locked" class="project-card__lock"><fa icon="lock" /></span>
      {{ project.displayName || project.name }}
    </div>
    <div v-if="project.displayName && project.name !== project.displayName" class="project-card__slug">{{ project.name }}</div>
  </div>
  <div class="project-card__details">
    <span class="project-card__badge" :class="'project-card__badge--' + project.type">
      {{ project.type }}
    </span>
    <span v-if="project.env" class="project-card__detail">
      <fa :icon="project.type === 'cluster' ? 'network-wired' : 'robot'" /> {{ project.env }}
    </span>
    <span v-if="project.productionReady" class="project-card__detail project-card__detail--ready">
      <fa icon="check-circle" /> Ready
    </span>
  </div>
  <div class="project-card__actions" @click.stop>
    <div class="project-card__menu-wrapper">
      <UiButton @click="toggleMenu" v-tooltip="'<b>Actions</b>'">
        <fa icon="ellipsis-v" />
      </UiButton>
      <div v-if="showMenu" class="project-card__dropdown" @click.stop>
        <a href="#" @click.prevent="menuAction('edit')"><fa icon="edit" /> Edit</a>
        <a v-if="!project.locked" href="#" @click.prevent="menuAction('lock')"><fa icon="lock" /> Lock</a>
        <a v-if="project.locked" href="#" @click.prevent="menuAction('unlock')"><fa icon="unlock" /> Unlock</a>
        <a href="#" @click.prevent="menuAction('delete')"><fa icon="trash" /> Delete</a>
      </div>
    </div>
  </div>
</div>
</template>
