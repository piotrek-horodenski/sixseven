<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useStudioStore } from '@/stores/projects/studio.store'
import { usePermission } from '@/composables/usePermission'
import type { IStudioPreset, IMasksPreset } from '@/stores/projects/studio.model'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const studioStore = useStudioStore()
const { hasPermission } = usePermission()

const canConfigure = computed(() => hasPermission('configure-unreal-studio'))
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

const showAddPreset = ref(false)
const newPresetName = ref('')
const showAddMasks = ref(false)
const newMasksName = ref('')
const showDeletePreset = ref(false)
const deletePresetTarget = ref<IStudioPreset | null>(null)
const showDeleteMasks = ref(false)
const deleteMasksTarget = ref<IMasksPreset | null>(null)

onMounted(() => {
  studioStore.init(projectId.value)
})

onUnmounted(() => {
  studioStore.cleanup()
})

function addPreset() {
  if (!newPresetName.value.trim()) return
  studioStore.createPreset({ pid: projectId.value, name: newPresetName.value.trim() })
  newPresetName.value = ''
  showAddPreset.value = false
}

function addMasksPreset() {
  if (!newMasksName.value.trim()) return
  studioStore.createMasksPreset({ pid: projectId.value, name: newMasksName.value.trim() })
  newMasksName.value = ''
  showAddMasks.value = false
}

function openDeletePreset(preset: IStudioPreset) {
  deletePresetTarget.value = preset
  showDeletePreset.value = true
}

function doDeletePreset() {
  if (deletePresetTarget.value) studioStore.deletePreset(deletePresetTarget.value._id)
  showDeletePreset.value = false
  deletePresetTarget.value = null
}

function openDeleteMasks(preset: IMasksPreset) {
  deleteMasksTarget.value = preset
  showDeleteMasks.value = true
}

function doDeleteMasks() {
  if (deleteMasksTarget.value) studioStore.deleteMasksPreset(deleteMasksTarget.value._id)
  showDeleteMasks.value = false
  deleteMasksTarget.value = null
}

</script>
<template>
<div class="project-studio" v-if="project">
  <!-- Camera Presets -->
  <div class="project-studio__section">
    <h3>Camera Presets</h3>
    <div class="project-studio__toolbar">
      <UiButton v-if="canConfigure" class="accent" @click="showAddPreset = true" :disabled="project.locked">
        <fa icon="plus" /> Add Preset
      </UiButton>
    </div>
    <div class="project-studio__presets" v-if="studioStore.presets.length">
      <div v-for="preset in studioStore.presets" :key="preset._id" class="preset-card">
        <div class="board-card__name">{{ preset.name }}</div>
        <div class="preset-card__details">
          Cam {{ preset.cameraIndex }} | Aperture: {{ preset.aperture }}
        </div>
        <div class="board-card__actions" @click.stop>
          <UiButton v-if="canConfigure" @click="openDeletePreset(preset)" :disabled="project.locked" v-tooltip="'Delete'">
            <fa icon="trash" />
          </UiButton>
        </div>
      </div>
    </div>
    <div v-else class="project-studio__placeholder">
      <fa icon="camera" />
      <p>No camera presets yet.</p>
    </div>
  </div>

  <!-- Masks Presets -->
  <div class="project-studio__section">
    <h3>Masks Presets</h3>
    <div class="project-studio__toolbar">
      <UiButton v-if="canConfigure" class="accent" @click="showAddMasks = true" :disabled="project.locked">
        <fa icon="plus" /> Add Masks Preset
      </UiButton>
    </div>
    <div class="project-studio__presets" v-if="studioStore.masksPresets.length">
      <div v-for="preset in studioStore.masksPresets" :key="preset._id" class="preset-card">
        <div class="board-card__name">{{ preset.name }}</div>
        <div class="preset-card__details">{{ preset.masks.length }} masks</div>
        <div class="board-card__actions" @click.stop>
          <UiButton v-if="canConfigure" @click="openDeleteMasks(preset)" :disabled="project.locked" v-tooltip="'Delete'">
            <fa icon="trash" />
          </UiButton>
        </div>
      </div>
    </div>
    <div v-else class="project-studio__placeholder">
      <fa icon="mask" />
      <p>No masks presets yet.</p>
    </div>
  </div>

  <!-- Add Preset Popup -->
  <UiPopup :show="showAddPreset" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAddPreset = false">
    <template #title>Add Camera Preset</template>
    <form class="concept-edit" @submit.prevent="addPreset">
      <UiInput :modelValue="newPresetName" @update:modelValue="(v: string) => newPresetName = v">Name</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newPresetName.trim()">Add</UiButton>
        <UiButton @click="showAddPreset = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Add Masks Popup -->
  <UiPopup :show="showAddMasks" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAddMasks = false">
    <template #title>Add Masks Preset</template>
    <form class="concept-edit" @submit.prevent="addMasksPreset">
      <UiInput :modelValue="newMasksName" @update:modelValue="(v: string) => newMasksName = v">Name</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newMasksName.trim()">Add</UiButton>
        <UiButton @click="showAddMasks = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Delete Preset Confirm -->
  <UiPopup :show="showDeletePreset" :size="EPopupSize.thin" :outsideClose="true" @update:show="showDeletePreset = false">
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="showDeletePreset = false">
      <p class="ui-confirm__message">Delete camera preset <strong>{{ deletePresetTarget?.name }}</strong>?</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDeletePreset">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Delete Masks Confirm -->
  <UiPopup :show="showDeleteMasks" :size="EPopupSize.thin" :outsideClose="true" @update:show="showDeleteMasks = false">
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="showDeleteMasks = false">
      <p class="ui-confirm__message">Delete masks preset <strong>{{ deleteMasksTarget?.name }}</strong>?</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDeleteMasks">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
