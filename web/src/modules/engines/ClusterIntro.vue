<script setup lang="ts">

import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEnginesStore } from '@/stores/engines/engines.store'
import type { ICluster } from '@/stores/engines/engines.model'

const store = useEnginesStore()
const route = useRoute()
const router = useRouter()

const cluster = ref<ICluster | null>(null)
const alias = ref('')
const saving = ref(false)

watch(() => route.params.id, (id) => {
  if (!id) { cluster.value = null; return }
  const found = store.clusters.find(c => c._id === id) || null
  cluster.value = found
  alias.value = found?.alias || ''
}, { immediate: true })

watch(() => store.clusters, () => {
  const id = route.params.id as string
  if (id) {
    const found = store.clusters.find(c => c._id === id) || null
    cluster.value = found
    if (found && alias.value === '') alias.value = found.alias
  }
}, { deep: true })

function save() {
  if (!cluster.value || !alias.value.trim()) return
  saving.value = true
  store.updateCluster({ _id: cluster.value._id, alias: alias.value.trim() })
  saving.value = false
}

function close() {
  router.push('/engines/clusters')
}

</script>
<template>
<div class="cluster-intro" v-if="cluster">
  <div class="cluster-intro__row">
    <UiInput
      :modelValue="alias"
      @update:modelValue="(v: string) => alias = v"
      @keyup.enter="save"
      placeholder="Cluster name..."
    />
    <UiButton class="accent" @click="save" :disabled="!alias.trim() || alias === cluster.alias">
      <fa icon="save" />
    </UiButton>
    <UiButton @click="close">
      <fa icon="times" />
    </UiButton>
  </div>
</div>
</template>
