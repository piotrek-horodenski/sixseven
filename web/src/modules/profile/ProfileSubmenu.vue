<script setup lang="ts">
</script>
<template>
<nav class="admin-submenu">
  <ul>
    <li>
      <RouterLink to="/profile/edit">
        <span class="icon"><fa icon="user" /></span>
        <span class="label">{{ $t('profile.editProfile') }}</span>
      </RouterLink>
    </li>
    <li>
      <RouterLink to="/profile/password">
        <span class="icon"><fa icon="key" /></span>
        <span class="label">{{ $t('profile.changePassword') }}</span>
      </RouterLink>
    </li>
  </ul>
</nav>
</template>
