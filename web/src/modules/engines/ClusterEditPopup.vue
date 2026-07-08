<script setup lang="ts">

import { ref, watch } from 'vue'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { ICluster } from '@/stores/engines/engines.model'
import { EPopupSize } from '@/controls/controls.model'

const props = defineProps<{
  show: boolean
  cluster: ICluster | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useEnginesStore()

const alias = ref('')
const isEdit = ref(false)

watch(() => props.show, (val) => {
  if (val) {
    if (props.cluster) {
      isEdit.value = true
      alias.value = props.cluster.alias
    } else {
      isEdit.value = false
      alias.value = ''
    }
  }
})

function save() {
  if (isEdit.value && props.cluster) {
    store.updateCluster({ _id: props.cluster._id, alias: alias.value })
  } else {
    store.createCluster({ alias: alias.value })
  }
  emit('close')
}

</script>
<template>
<UiPopup
  :show="show"
  :size="EPopupSize.thin"
  :outsideClose="true"
  @update:show="emit('close')"
>
  <template #title>{{ isEdit ? 'Edit Cluster' : 'Add Cluster' }}</template>
  <form class="cluster-edit" @submit.prevent="save">
    <UiInput
      :modelValue="alias"
      @update:modelValue="(v: string) => alias = v"
    >Alias</UiInput>

    <div class="cluster-edit__actions">
      <UiButton class="accent" type="submit" :disabled="!alias.trim()">
        {{ isEdit ? 'Save' : 'Add' }}
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
    </div>
  </form>
</UiPopup>
</template>
