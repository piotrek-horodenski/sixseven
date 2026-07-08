<script setup lang="ts">

import { ref, watch } from 'vue'
import { useConceptsStore } from '@/stores/concepts/concepts.store'
import type { IConcept } from '@/stores/concepts/concepts.model'
import { EPopupSize } from '@/controls/controls.model'

const props = defineProps<{
  show: boolean
  concept: IConcept | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useConceptsStore()

const name = ref('')
const description = ref('')
const isEdit = ref(false)

watch(() => props.show, (val) => {
  if (val) {
    if (props.concept) {
      isEdit.value = true
      name.value = props.concept.name
      description.value = props.concept.description
    } else {
      isEdit.value = false
      name.value = ''
      description.value = ''
    }
  }
})

function save() {
  if (isEdit.value && props.concept) {
    store.updateConcept({
      _id: props.concept._id,
      name: name.value,
      description: description.value,
    })
  } else {
    store.createConcept({
      name: name.value,
      description: description.value,
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
  <template #title>{{ isEdit ? 'Edit Concept' : 'Add Concept' }}</template>
  <form class="concept-edit" @submit.prevent="save">
    <UiInput
      :modelValue="name"
      @update:modelValue="(v: string) => name = v"
    >Name</UiInput>

    <UiTextarea
      :modelValue="description"
      @update:modelValue="(v: string) => description = v"
    >Description</UiTextarea>

    <div class="concept-edit__actions">
      <UiButton class="accent" type="submit" :disabled="!name.trim()">
        {{ isEdit ? 'Save' : 'Add' }}
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
    </div>
  </form>
</UiPopup>
</template>
