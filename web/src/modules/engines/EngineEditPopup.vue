<script setup lang="ts">

import { ref, watch } from 'vue'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { IEngine } from '@/stores/engines/engines.model'
import { EPopupSize } from '@/controls/controls.model'

const props = defineProps<{
  show: boolean
  engine: IEngine | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useEnginesStore()

const alias = ref('')
const address = ref('')
const port = ref(30011)
const rePort = ref(30010)
const cameraNumber = ref(0)

const isEdit = ref(false)

watch(() => props.show, (val) => {
  if (val) {
    if (props.engine) {
      isEdit.value = true
      alias.value = props.engine.alias
      address.value = props.engine.address
      port.value = props.engine.port
      rePort.value = props.engine.rePort
      cameraNumber.value = props.engine.cameraNumber
    } else {
      isEdit.value = false
      alias.value = ''
      address.value = ''
      port.value = 30011
      rePort.value = 30010
      cameraNumber.value = 0
    }
  }
})

function save() {
  if (isEdit.value && props.engine) {
    store.updateEngine({
      _id: props.engine._id,
      alias: alias.value,
      cameraNumber: cameraNumber.value,
    })
  } else {
    store.createEngine({
      alias: alias.value,
      address: address.value,
      port: port.value,
      rePort: rePort.value,
      cameraNumber: cameraNumber.value,
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
  <template #title>{{ isEdit ? 'Edit Engine' : 'Add Engine' }}</template>
  <form class="engine-edit" @submit.prevent="save">
    <UiInput
      :modelValue="alias"
      @update:modelValue="(v: string) => alias = v"
    >Alias</UiInput>

    <UiInput
      :modelValue="address"
      @update:modelValue="(v: string) => address = v"
      :disabled="isEdit"
    >Address</UiInput>

    <UiNumber
      :modelValue="port"
      @update:modelValue="(v: number) => port = v"
      :disabled="isEdit"
    >Guard Port</UiNumber>

    <UiNumber
      :modelValue="rePort"
      @update:modelValue="(v: number) => rePort = v"
      :disabled="isEdit"
    >Remote Control Port</UiNumber>

    <UiNumber
      :modelValue="cameraNumber"
      @update:modelValue="(v: number) => cameraNumber = v"
    >Camera Number (0 = no preference)</UiNumber>

    <div class="engine-edit__actions">
      <UiButton class="accent" type="submit" :disabled="!alias.trim() || (!isEdit && !address.trim())">
        {{ isEdit ? 'Save' : 'Add' }}
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
    </div>
  </form>
</UiPopup>
</template>
