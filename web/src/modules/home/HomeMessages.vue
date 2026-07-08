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
      :closable="true"
      @close="close"
    >
      <template #title>
        Important information
      </template>
      info message
    </UiMessage>
  </UiHeightTransition>
</div>
</template>
