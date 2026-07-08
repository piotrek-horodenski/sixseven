<script setup lang="ts">

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'
import EngineCard from './EngineCard.vue'
import EngineEditPopup from './EngineEditPopup.vue'
import EngineDeleteConfirm from './EngineDeleteConfirm.vue'

const store = useEnginesStore()
const router = useRouter()

const showEdit = ref(false)
const editTarget = ref<IEngine | null>(null)
const showDelete = ref(false)
const deleteTarget = ref<IEngine | null>(null)

onMounted(() => {
  store.init()
})

function openAdd() {
  editTarget.value = null
  showEdit.value = true
}

function openEdit(engine: IEngine) {
  editTarget.value = engine
  showEdit.value = true
}

function closeEdit() {
  showEdit.value = false
  editTarget.value = null
}

function openDelete(engine: IEngine) {
  deleteTarget.value = engine
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    store.deleteEngine(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

function cancelDelete() {
  showDelete.value = false
  deleteTarget.value = null
}

function selectEngine(engine: IEngine) {
  router.push(`/engines/list/${engine._id}`)
}

function wakeUp(engine: IEngine) {
  store.wakeUpEngine(engine._id)
}

function unlockEngine(engine: IEngine) {
  store.unlockEngine(engine._id)
}

function showLogs(engine: IEngine) {
  const resolved = router.resolve({ name: 'engine-logs', params: { id: engine._id } })
  window.open(resolved.href, '_blank')
}

function showErrors(engine: IEngine) {
  const resolved = router.resolve({ name: 'engine-errors', params: { id: engine._id } })
  window.open(resolved.href, '_blank')
}

</script>
<template>
<div class="engines-view">
  <div class="engines-view__toolbar">
    <UiInput
      :modelValue="store.searchPhrase"
      @update:modelValue="(v: string) => store.searchPhrase = v"
      placeholder="Search engines..."
    />
    <UiButton class="accent" @click="openAdd">
      <fa icon="plus" /> Add Engine
    </UiButton>
  </div>

  <div class="engines-view__list">
    <EngineCard
      v-for="engine in store.filteredEngines"
      :key="engine._id"
      :engine="engine"
      @select="selectEngine"
      @edit="openEdit"
      @delete="openDelete"
      @wakeUp="wakeUp"
      @unlock="unlockEngine"
      @showLogs="showLogs"
      @showErrors="showErrors"
    />
    <div v-if="!store.filteredEngines.length" class="engines-view__empty">
      <fa icon="server" />
      <p>No engines found</p>
    </div>
  </div>

  <EngineEditPopup
    :show="showEdit"
    :engine="editTarget"
    @close="closeEdit"
  />

  <EngineDeleteConfirm
    :show="showDelete"
    :engine="deleteTarget"
    @confirm="doDelete"
    @cancel="cancelDelete"
  />
</div>
</template>
