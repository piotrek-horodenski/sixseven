<script setup lang="ts">

import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/modules/layout/AppLayout.vue'
import { useGateStore } from '@/stores/gate/gate.store'

const gate = useGateStore()
const route = useRoute()

const isPublicRoute = computed(() => route.meta?.public === true)

onMounted(() => {
  gate.connect()
})

</script>
<template>
  <div class="app-content">
    <template v-if="isPublicRoute">
      <RouterView />
    </template>
    <template v-else>
      <AppLayout />
    </template>
  </div>

  <textarea
    id="proto-textarea"
    class="ui-textarea__textarea ui-textarea__proto"
  ></textarea>
  <div id="popups" class="popups"></div>
</template>
