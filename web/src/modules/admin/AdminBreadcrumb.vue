<script setup lang="ts">

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const crumb = computed(() => {
  const name = route.name as string
  if (name?.startsWith('admin-settings')) return t('admin.settings')
  if (name?.startsWith('admin-games')) return t('admin.games')
  if (name?.startsWith('admin-role')) return t('admin.roles')
  return t('admin.users')
})

</script>
<template>
<div class="admin-breadcrumb">
  <span class="admin-breadcrumb__root">{{ $t('admin.breadcrumbRoot') }}</span>
  <span class="admin-breadcrumb__separator">&gt;</span>
  <span class="admin-breadcrumb__current">{{ crumb }}</span>
</div>
</template>
