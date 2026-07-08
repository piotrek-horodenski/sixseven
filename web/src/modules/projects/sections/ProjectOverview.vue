<script setup lang="ts">

import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useEnginesStore } from '@/stores/engines/engines.store'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import { usePermission } from '@/composables/usePermission'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const enginesStore = useEnginesStore()
const conceptsStore = useConceptsStore()
const { hasPermission } = usePermission()

const canEdit = computed(() => hasPermission('edit-unreal-projects'))
const canLoad = computed(() => hasPermission('load-and-clear-unreal-projects'))

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

// Editable fields
const name = ref('')
const displayName = ref('')
const map = ref('')
const source = ref('')
const env = ref('')
const devEngine = ref('')
const conceptField = ref('')
const useBatch = ref(false)
const useStandalone = ref(true)

// Confirmation popups
const showLoadConfirm = ref(false)
const showClearConfirm = ref(false)
const showResetConfirm = ref(false)
const loadingDefs = ref(false)

watch(project, (p) => {
  if (p) {
    name.value = p.name
    displayName.value = p.displayName
    map.value = p.map
    source.value = p.source
    env.value = p.env
    devEngine.value = p.devEngine
    conceptField.value = p.concept
    useBatch.value = p.useBatch
    useStandalone.value = p.useStandalone
  }
}, { immediate: true })

const envOptions = computed(() => {
  const options: { value: string; label: string; type: string }[] = []
  for (const cluster of enginesStore.clusters) {
    options.push({ value: cluster._id, label: cluster.alias + ' (cluster)', type: 'cluster' })
  }
  for (const engine of enginesStore.engines) {
    options.push({ value: engine._id, label: engine.alias + ' (engine)', type: 'standalone' })
  }
  return options
})

const conceptOptions = computed(() => {
  const options = [{ value: '', label: 'Unassigned' }]
  for (const concept of conceptsStore.concepts) {
    options.push({ value: concept._id, label: concept.name })
  }
  return options
})

const engineOptions = computed(() => {
  return enginesStore.engines.map(e => ({ value: e._id, label: e.alias }))
})

function saveField(field: string, value: any) {
  if (!project.value) return
  projectsStore.updateProject({ _id: project.value._id, [field]: value })
}

function saveEnv(envId: string) {
  if (!project.value) return
  const option = envOptions.value.find(o => o.value === envId)
  projectsStore.updateProject({
    _id: project.value._id,
    env: envId,
    type: option?.type as 'standalone' | 'cluster' || 'standalone',
  })
}

function doLoad() {
  if (!project.value) return
  projectsStore.loadProject(project.value._id)
  showLoadConfirm.value = false
}

function doLoadEditor() {
  if (!project.value) return
  projectsStore.loadProject(project.value._id, true)
  showLoadConfirm.value = false
}

function doClear() {
  if (!project.value) return
  projectsStore.unloadProject(project.value._id)
  showClearConfirm.value = false
}

function doSync() {
  if (!project.value) return
  projectsStore.syncProject(project.value._id)
}

function doReset() {
  if (!project.value) return
  projectsStore.resetProject(project.value._id)
  showResetConfirm.value = false
}

function doLoadDefs() {
  if (!project.value) return
  loadingDefs.value = true
  projectsStore.loadDefs(project.value._id)
  setTimeout(() => { loadingDefs.value = false }, 3000)
}

function toggleLock() {
  if (!project.value) return
  if (project.value.locked) {
    projectsStore.unlockProject(project.value._id)
  } else {
    projectsStore.lockProject(project.value._id)
  }
}

</script>
<template>
<div class="project-overview" v-if="project">
  <!-- Actions Bar -->
  <div class="project-overview__actions-bar" v-if="canLoad">
    <div class="project-overview__action-group">
      <span class="project-overview__action-label">Project</span>
      <UiButton class="accent" @click="showLoadConfirm = true" :disabled="project.locked">
        <fa icon="play" /> Load
      </UiButton>
      <UiButton @click="doSync" :disabled="project.locked">
        <fa icon="sync" /> Sync
      </UiButton>
      <UiButton @click="showClearConfirm = true" :disabled="project.locked">
        <fa icon="stop" /> Clear
      </UiButton>
    </div>
    <div class="project-overview__action-group" v-if="canEdit">
      <span class="project-overview__action-label">Definitions</span>
      <UiButton @click="doLoadDefs" :disabled="project.locked" :loading="loadingDefs">
        <fa icon="download" /> Update
      </UiButton>
      <UiButton @click="showResetConfirm = true" :disabled="project.locked">
        <fa icon="undo" /> Reset
      </UiButton>
    </div>
    <div class="project-overview__action-group">
      <UiButton @click="toggleLock" :class="project.locked ? 'danger' : 'success'">
        <fa :icon="project.locked ? 'lock' : 'unlock'" />
        {{ project.locked ? 'Unlock' : 'Lock' }}
      </UiButton>
    </div>
  </div>

  <!-- Identity -->
  <div class="project-overview__section">
    <h3>Identity</h3>
    <div class="project-overview__fields">
      <div class="project-overview__field">
        <UiInput
          :modelValue="source"
          @update:modelValue="(v: string) => { source = v; saveField('source', v) }"
          :disabled="!canEdit || project.locked"
        >Source (Deploy)</UiInput>
      </div>
      <div class="project-overview__field">
        <UiInput
          :modelValue="name"
          @update:modelValue="(v: string) => { name = v; saveField('name', v) }"
          :disabled="!canEdit || project.locked"
        >Target Name (Engine)</UiInput>
      </div>
      <div class="project-overview__field">
        <UiInput
          :modelValue="displayName"
          @update:modelValue="(v: string) => { displayName = v; saveField('displayName', v) }"
          :disabled="!canEdit || project.locked"
        >Display Name</UiInput>
      </div>
      <div class="project-overview__field">
        <UiInput
          :modelValue="map"
          @update:modelValue="(v: string) => { map = v; saveField('map', v) }"
          :disabled="!canEdit || project.locked"
        >Map</UiInput>
      </div>
    </div>
  </div>

  <!-- Concept -->
  <div class="project-overview__section">
    <h3>Concept</h3>
    <div class="project-overview__fields">
      <div class="project-overview__field">
        <label>Concept</label>
        <select
          :value="conceptField"
          @change="(e: Event) => { const v = (e.target as HTMLSelectElement).value; conceptField = v; projectsStore.assignConcept(project!._id, v) }"
          :disabled="!canEdit || project.locked"
        >
          <option v-for="opt in conceptOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Engine Assignment -->
  <div class="project-overview__section">
    <h3>Engine Assignment</h3>
    <div class="project-overview__fields">
      <div class="project-overview__field">
        <label>Environment</label>
        <select
          :value="env"
          @change="(e: Event) => { const v = (e.target as HTMLSelectElement).value; env = v; saveEnv(v) }"
          :disabled="!canEdit || project.locked"
        >
          <option value="">None</option>
          <option v-for="opt in envOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="project-overview__field">
        <label>Dev Engine</label>
        <select
          :value="devEngine"
          @change="(e: Event) => { const v = (e.target as HTMLSelectElement).value; devEngine = v; saveField('devEngine', v) }"
          :disabled="!canEdit || project.locked"
        >
          <option value="">None</option>
          <option v-for="opt in engineOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="project-overview__field project-overview__field--inline">
        <UiSwitch
          :modelValue="useBatch"
          @update:modelValue="(v: boolean) => { useBatch = v; saveField('useBatch', v) }"
          :disabled="!canEdit || project.locked"
        >Batch Mode</UiSwitch>
      </div>
      <div class="project-overview__field project-overview__field--inline">
        <UiSwitch
          :modelValue="useStandalone"
          @update:modelValue="(v: boolean) => { useStandalone = v; saveField('useStandalone', v) }"
          :disabled="!canEdit || project.locked"
        >Standalone Mode</UiSwitch>
      </div>
    </div>
  </div>

  <!-- Status -->
  <div class="project-overview__section">
    <h3>Status</h3>
    <div class="project-overview__status">
      <span class="project-overview__status-item">
        <fa :icon="project.locked ? 'lock' : 'unlock'" />
        {{ project.locked ? 'Locked' : 'Unlocked' }}
      </span>
      <span class="project-overview__status-item">
        <fa :icon="project.productionReady ? 'check-circle' : 'times-circle'" />
        {{ project.productionReady ? 'Production Ready' : 'Not Production Ready' }}
      </span>
      <span class="project-overview__status-item">
        Type: {{ project.type }}
      </span>
    </div>
  </div>

  <!-- Confirmation Popups -->
  <UiPopup :show="showLoadConfirm" :size="EPopupSize.thin" :outsideClose="true" @update:show="showLoadConfirm = false">
    <template #title>Load Project</template>
    <form class="ui-confirm" @submit.prevent="showLoadConfirm = false">
      <p class="ui-confirm__message">Load <strong>{{ project.displayName || project.name }}</strong> on all assigned engines?</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" @click="doLoad"><fa icon="play" /> Load Game</UiButton>
        <UiButton @click="doLoadEditor"><fa icon="edit" /> Load Editor</UiButton>
        <UiButton type="submit">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <UiPopup :show="showClearConfirm" :size="EPopupSize.thin" :outsideClose="true" @update:show="showClearConfirm = false">
    <template #title>Clear Project</template>
    <form class="ui-confirm" @submit.prevent="showClearConfirm = false">
      <p class="ui-confirm__message">Unload <strong>{{ project.displayName || project.name }}</strong> from all engines?</p>
      <div class="ui-confirm__actions">
        <UiButton @click="doClear"><fa icon="stop" /> Yes, Clear</UiButton>
        <UiButton class="accent" type="submit">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <UiPopup :show="showResetConfirm" :size="EPopupSize.thin" :outsideClose="true" @update:show="showResetConfirm = false">
    <template #title>Reset Project</template>
    <form class="ui-confirm" @submit.prevent="showResetConfirm = false">
      <p class="ui-confirm__message">Reset <strong>{{ project.displayName || project.name }}</strong>? This will unlock the project and clear all runtime data.</p>
      <div class="ui-confirm__actions">
        <UiButton @click="doReset"><fa icon="undo" /> Yes, Reset</UiButton>
        <UiButton class="accent" type="submit">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
