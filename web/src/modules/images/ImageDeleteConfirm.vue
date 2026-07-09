<script setup lang="ts">

import type { IImage } from '@/stores/images/images.model'
import { EPopupSize } from '@/controls/controls.model'

defineProps<{
  show: boolean
  image: IImage | null
  force: boolean
}>()

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

</script>
<template>
<UiPopup
  :show="show"
  :size="EPopupSize.thin"
  :outsideClose="true"
  @update:show="emit('cancel')"
>
  <template #title>Confirm Delete</template>
  <form class="ui-confirm" @submit.prevent="emit('cancel')">
    <p class="ui-confirm__message">
      {{ force
        ? 'Are you sure you want to permanently delete this image? This cannot be undone.'
        : 'Are you sure you want to delete this image?'
      }}
    </p>
    <p v-if="image" class="ui-confirm__detail">
      {{ image.title }}
    </p>
    <div class="ui-confirm__actions">
      <UiButton class="accent" type="submit">Cancel</UiButton>
      <UiButton @click="emit('confirm')">Yes, delete</UiButton>
    </div>
  </form>
</UiPopup>
</template>
