<script setup lang="ts">
</script>
<template>
<nav class="concepts-submenu">
  <ul>
    <li>
      <RouterLink to="/concepts">
        <span class="icon"><fa icon="lightbulb" /></span>
        <span class="label">All Concepts</span>
      </RouterLink>
    </li>
    <li>
      <RouterLink to="/concepts/unassigned/projects">
        <span class="icon"><fa icon="folder-open" /></span>
        <span class="label">Unassigned</span>
      </RouterLink>
    </li>
  </ul>
</nav>
</template>
