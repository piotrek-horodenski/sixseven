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
        <span class="label">Users</span>
      </RouterLink>
    </li>
    <li v-if="hasPermission('manage-roles')">
      <RouterLink to="/admin/roles">
        <span class="icon"><fa icon="shield-halved" /></span>
        <span class="label">Roles</span>
      </RouterLink>
    </li>
    <li v-if="hasPermission('manage-settings')">
      <RouterLink to="/admin/settings">
        <span class="icon"><fa icon="sliders" /></span>
        <span class="label">Settings</span>
      </RouterLink>
    </li>
  </ul>
</nav>
</template>
