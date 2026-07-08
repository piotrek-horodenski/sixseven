<script setup lang="ts">

import { ref, watch } from 'vue'
import { useProjectsStore } from '@/stores/projects/projects.store'
import type { IProject } from '@/stores/projects/projects.model'
import { EPopupSize } from '@/controls/controls.model'

const props = defineProps<{
  show: boolean
  project: IProject | null
  conceptId: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useProjectsStore()

const name = ref('')
const displayName = ref('')
const map = ref('')
const source = ref('')
const type = ref<'standalone' | 'cluster'>('standalone')

const isEdit = ref(false)

watch(() => props.show, (val) => {
  if (val) {
    if (props.project) {
      isEdit.value = true
      name.value = props.project.name
      displayName.value = props.project.displayName
      map.value = props.project.map
      source.value = props.project.source
      type.value = props.project.type
    } else {
      isEdit.value = false
      name.value = ''
      displayName.value = ''
      map.value = ''
      source.value = ''
      type.value = 'standalone'
    }
  }
})

function save() {
  if (isEdit.value && props.project) {
    store.updateProject({
      _id: props.project._id,
      name: name.value,
      displayName: displayName.value,
      map: map.value,
      source: source.value,
      type: type.value,
    })
  } else {
    store.createProject({
      name: name.value,
      displayName: displayName.value,
      map: map.value,
      source: source.value,
      type: type.value,
      concept: props.conceptId === 'unassigned' ? '' : props.conceptId,
    })
  }
  emit('close')
}

</script>
<template>
<UiPopup
  :show="show"
  :size="EPopupSize.regular"
  :outsideClose="true"
  @update:show="emit('close')"
>
  <template #title>{{ isEdit ? 'Edit Project' : 'Add Project' }}</template>
  <form class="project-edit" @submit.prevent="save">
    <UiInput
      :modelValue="name"
      @update:modelValue="(v: string) => name = v"
    >Name</UiInput>

    <UiInput
      :modelValue="displayName"
      @update:modelValue="(v: string) => displayName = v"
    >Display Name</UiInput>

    <UiInput
      :modelValue="map"
      @update:modelValue="(v: string) => map = v"
    >Map</UiInput>

    <UiInput
      :modelValue="source"
      @update:modelValue="(v: string) => source = v"
    >Source</UiInput>

    <div class="project-edit__type">
      <label>Type</label>
      <div class="project-edit__type-options">
        <UiRadio
          :modelValue="type"
          @update:modelValue="(v: string) => type = v as 'standalone' | 'cluster'"
          value="standalone"
        >Standalone</UiRadio>
        <UiRadio
          :modelValue="type"
          @update:modelValue="(v: string) => type = v as 'standalone' | 'cluster'"
          value="cluster"
        >Cluster</UiRadio>
      </div>
    </div>

    <div class="project-edit__actions">
      <UiButton class="accent" type="submit" :disabled="!name.trim()">
        {{ isEdit ? 'Save' : 'Add' }}
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
    </div>
  </form>
</UiPopup>
</template>
