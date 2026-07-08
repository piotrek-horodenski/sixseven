<script setup lang="ts">
</script>
<template>
<nav class="engines-submenu">
  <ul>
    <li>
      <RouterLink to="/engines/list">
        <span class="icon"><fa icon="robot" /></span>
        <span class="label">Engines</span>
      </RouterLink>
    </li>
    <li>
      <RouterLink to="/engines/clusters">
        <span class="icon"><fa icon="network-wired" /></span>
        <span class="label">Clusters</span>
      </RouterLink>
    </li>
  </ul>
</nav>
</template>
