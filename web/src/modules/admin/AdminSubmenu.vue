<script setup lang="ts">
import { usePermission } from '@/composables/usePermission'

const { hasPermission } = usePermission()
</script>
<template>
<nav class="admin-submenu">
  <ul>
    <li v-if="hasPermission('manage-users')">
      <RouterLink to="/admin/users">
        <span class="icon"><fa icon="users" /></span>
        <span class="label">{{ $t('admin.users') }}</span>
      </RouterLink>
    </li>
    <li v-if="hasPermission('manage-roles')">
      <RouterLink to="/admin/roles">
        <span class="icon"><fa icon="shield-halved" /></span>
        <span class="label">{{ $t('admin.roles') }}</span>
      </RouterLink>
    </li>
    <li v-if="hasPermission('manage-games')">
      <RouterLink to="/admin/games">
        <span class="icon"><fa icon="gamepad" /></span>
        <span class="label">{{ $t('admin.games') }}</span>
      </RouterLink>
    </li>
    <li v-if="hasPermission('manage-settings')">
      <RouterLink to="/admin/settings">
        <span class="icon"><fa icon="sliders" /></span>
        <span class="label">{{ $t('admin.settings') }}</span>
      </RouterLink>
    </li>
  </ul>
</nav>
</template>
