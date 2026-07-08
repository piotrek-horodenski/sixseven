<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const crumb = computed(() => {
  const name = route.name as string
  if (name?.startsWith('admin-settings')) return 'Settings'
  if (name?.startsWith('admin-role')) return 'Roles'
  return 'Users'
})

</script>
<template>
<div class="admin-breadcrumb">
  <span class="admin-breadcrumb__root">Admin</span>
  <span class="admin-breadcrumb__separator">&gt;</span>
  <span class="admin-breadcrumb__current">{{ crumb }}</span>
</div>
</template>
