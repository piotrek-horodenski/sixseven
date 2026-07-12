<script setup lang="ts">

import { onMounted, reactive, watch } from 'vue'
import { useAdminStore } from '@/stores/admin/admin.store'

const admin = useAdminStore()

const saveState = reactive<Record<string, { saving: boolean, saved: boolean }>>({})
const editValues = reactive<Record<string, string>>({})
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

onMounted(() => {
  admin.init()
})

function getSaveState(id: string) {
  if (!saveState[id]) {
    saveState[id] = { saving: false, saved: false }
  }
  return saveState[id]
}

function doSave(setting: any, value: unknown) {
  const state = getSaveState(setting._id)
  state.saving = true
  state.saved = false
  admin.updateSetting(setting._id, value)
}

function onSwitchChange(setting: any, value: boolean) {
  doSave(setting, value)
}

function getEditValue(setting: any): string {
  if (setting._id in editValues) {
    return editValues[setting._id]
  }
  return String(setting.value ?? '')
}

function onTextInput(setting: any, value: string) {
  editValues[setting._id] = value

  if (debounceTimers[setting._id]) {
    clearTimeout(debounceTimers[setting._id])
  }

  debounceTimers[setting._id] = setTimeout(() => {
    const finalValue = setting.type === 'number' ? Number(value) : value
    doSave(setting, finalValue)
    delete editValues[setting._id]
  }, 500)
}

// Watch for collection-update responses to flip saving -> saved
watch(() => admin.settings, () => {
  for (const id in saveState) {
    if (saveState[id].saving) {
      saveState[id].saving = false
      saveState[id].saved = true
    }
  }
}, { deep: true })

</script>
<template>
<div class="admin-settings">
  <div class="admin-settings__header">
    <h2>{{ $t('admin.settings') }}</h2>
  </div>

  <div class="admin-settings__list">
    <div
      v-for="setting in admin.settings"
      :key="setting._id"
      class="admin-settings__item"
    >
      <div class="admin-settings__item-info">
        <span class="admin-settings__item-name">{{ setting.display || setting.name }}</span>
        <span class="admin-settings__item-key admin-muted">{{ setting.name }}</span>
      </div>

      <div class="admin-settings__item-control">
        <UiSwitch
          v-if="setting.type === 'boolean'"
          :modelValue="!!setting.value"
          @change="(val: boolean) => onSwitchChange(setting, val)"
        />

        <template v-else>
          <UiInput
            v-if="setting.type === 'text'"
            :modelValue="getEditValue(setting)"
            @update:modelValue="(val: string) => onTextInput(setting, val)"
          />
          <UiInput
            v-else-if="setting.type === 'number'"
            :modelValue="getEditValue(setting)"
            @update:modelValue="(val: string) => onTextInput(setting, val)"
            type="number"
          />
        </template>

        <UiSaveIndicator
          :saving="getSaveState(setting._id).saving"
          :saved="getSaveState(setting._id).saved"
        />
      </div>
    </div>
  </div>
</div>
</template>
