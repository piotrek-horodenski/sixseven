<script setup lang="ts">

import { usePermission } from '@/composables/usePermission'

const { hasPermission } = usePermission()

const emits = defineEmits<{
  (event: 'onSelect'): void
}>()
const props = withDefaults(defineProps<{ tabindex: number }>(), {
  tabindex: -1,
})

function onSelect() {
  emits('onSelect')
}

</script>
<template>
<ul>
  <li>
    <RouterLink
      to="/"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="home" /></span>
      <span class="label">Home</span>
    </RouterLink>
  </li>
  <li>
    <RouterLink
      to="/play"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="gamepad" /></span>
      <span class="label">Graj</span>
    </RouterLink>
  </li>
  <li>
    <RouterLink
      to="/controls"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="network-wired" /></span>
      <span class="label">Controls</span>
    </RouterLink>
  </li>
  <li>
    <RouterLink
      to="/typo"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="robot" /></span>
      <span class="label">Typography</span>
    </RouterLink>
  </li>
  <li v-if="hasPermission('access-images')">
    <RouterLink
      to="/images"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="images" /></span>
      <span class="label">Images</span>
    </RouterLink>
  </li>
  <li v-if="hasPermission('view-admin')">
    <RouterLink
      to="/admin"
      :tabindex="props.tabindex"
      @click="onSelect"
    >
      <span class="icon"><fa icon="lock" /></span>
      <span class="label">Admin</span>
    </RouterLink>
  </li>
</ul>
</template>
