<script setup lang="ts">

import UiHeightTransition from '@/controls/UiHeightTransition.vue';
import { ref } from 'vue'

const visible = ref(true)

function close() {
  visible.value = false
}

</script>
<template>
<div>
  <UiHeightTransition>
    <UiMessage
      v-if="visible"
      type="warning"
      :closable="true"
      @close="close"
    >
      <template #title>
        Warning
      </template>
      Typography warning message
    </UiMessage>
  </UiHeightTransition>
</div>
</template>
