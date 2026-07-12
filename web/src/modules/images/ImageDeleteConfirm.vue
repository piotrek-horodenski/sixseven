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
  <template #title>{{ $t('images.confirmDelete') }}</template>
  <form class="ui-confirm" @submit.prevent="emit('cancel')">
    <p class="ui-confirm__message">
      {{ force
        ? $t('images.confirmForceDeleteMsg')
        : $t('images.confirmDeleteMsg')
      }}
    </p>
    <p v-if="image" class="ui-confirm__detail">
      {{ image.title }}
    </p>
    <div class="ui-confirm__actions">
      <UiButton class="accent" type="submit">{{ $t('common.cancel') }}</UiButton>
      <UiButton @click="emit('confirm')">{{ $t('images.yesDelete') }}</UiButton>
    </div>
  </form>
</UiPopup>
</template>
