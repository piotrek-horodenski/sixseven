<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useEnvironmentStore } from '@/stores/projects/environment.store'
import { usePermission } from '@/composables/usePermission'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const envStore = useEnvironmentStore()
const { hasPermission } = usePermission()

const canEdit = computed(() => hasPermission('edit-unreal-projects'))
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

const globalEnv = computed(() => {
  return envStore.environments.find(e => e.id === '_')
})

const globalItems = computed(() => {
  return globalEnv.value?.items || []
})

// Add parameter
const showAdd = ref(false)
const newKey = ref('')
const newValue = ref('')

onMounted(() => {
  envStore.init(projectId.value)
})

onUnmounted(() => {
  envStore.cleanup()
})

function addParameter() {
  if (!newKey.value.trim()) return

  const items = [...globalItems.value, { propertyID: newKey.value.trim(), preset: '_', value: newValue.value }]
  envStore.saveEnvironment(projectId.value, items)
  newKey.value = ''
  newValue.value = ''
  showAdd.value = false
}

function removeParameter(index: number) {
  const items = [...globalItems.value]
  items.splice(index, 1)
  envStore.saveEnvironment(projectId.value, items)
}

function updateParameterValue(index: number, value: string) {
  const items = [...globalItems.value]
  items[index] = { ...items[index], value }
  envStore.saveEnvironment(projectId.value, items)
}

</script>
<template>
<div class="project-environment" v-if="project">
  <div class="project-environment__toolbar">
    <UiButton v-if="canEdit" class="accent" @click="showAdd = true" :disabled="project.locked">
      <fa icon="plus" /> Add Parameter
    </UiButton>
  </div>

  <div class="project-environment__list" v-if="globalItems.length">
    <div
      v-for="(item, index) in globalItems"
      :key="index"
      class="project-environment__row"
    >
      <div class="project-environment__key">{{ item.propertyID }}</div>
      <div class="project-environment__value">
        <UiInput
          :modelValue="item.value || ''"
          @update:modelValue="(v: string) => updateParameterValue(index, v)"
          :disabled="!canEdit || project.locked"
          placeholder="Value"
        />
      </div>
      <div class="project-environment__actions" v-if="canEdit" @click.stop>
        <UiButton @click="removeParameter(index)" :disabled="project.locked" v-tooltip="'Remove'">
          <fa icon="trash" />
        </UiButton>
      </div>
    </div>
  </div>

  <div v-else class="project-environment__placeholder">
    <fa icon="cogs" />
    <h3>No Parameters</h3>
    <p>Add environment parameters that will be merged at take time.</p>
  </div>

  <!-- Add Parameter -->
  <UiPopup :show="showAdd" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAdd = false">
    <template #title>Add Parameter</template>
    <form class="concept-edit" @submit.prevent="addParameter">
      <UiInput :modelValue="newKey" @update:modelValue="(v: string) => newKey = v">Key</UiInput>
      <UiInput :modelValue="newValue" @update:modelValue="(v: string) => newValue = v">Value</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newKey.trim()">Add</UiButton>
        <UiButton @click="showAdd = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
