<script setup lang="ts">

import type { IEngine } from '@/stores/engines/engines.model'
import { EPopupSize } from '@/controls/controls.model'

defineProps<{
  show: boolean
  engine: IEngine | null
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
      Are you sure you want to delete engine <strong>{{ engine?.alias }}</strong>?
    </p>
    <div class="ui-confirm__actions">
      <UiButton class="accent" type="submit">Cancel</UiButton>
      <UiButton @click="emit('confirm')">Yes, delete</UiButton>
    </div>
  </form>
</UiPopup>
</template>
