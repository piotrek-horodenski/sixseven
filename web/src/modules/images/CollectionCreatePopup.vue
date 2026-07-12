<script setup lang="ts">

import { ref, watch } from 'vue'
import { useImagesStore } from '@/stores/images/images.store'
import { EPopupSize } from '@/controls/controls.model'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useImagesStore()
const name = ref('')

watch(() => props.show, (val) => {
  if (val) {
    name.value = ''
  }
})

async function create() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  await store.addCollection(trimmed)
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
  <template #title>{{ $t('images.newCollection') }}</template>
  <form class="ui-form" @submit.prevent="create">
    <UiInput
      :modelValue="name"
      @update:modelValue="(v: string) => name = v"
      :placeholder="$t('images.collectionNamePlaceholder')"
      autofocus
    />
    <div class="ui-form__buttons">
      <UiButton type="button" @click="emit('close')">{{ $t('common.cancel') }}</UiButton>
      <UiButton class="accent" type="submit" :disabled="!name.trim()">{{ $t('images.create') }}</UiButton>
    </div>
  </form>
</UiPopup>
</template>
