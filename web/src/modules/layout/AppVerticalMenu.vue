<script setup lang="ts">

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import MainMenu from './MainMenu.vue'
import { useLayoutStore } from '@/stores/layout/layout.store'
import { useProfileMenu } from './useProfileMenu'

const { profileOpen, profileMenuRef, logoutLoading, displayName, toggleProfile, logout } = useProfileMenu()
const menuHidden = ref(false)

const {
  isMenuExpanded,
  isMenuVertical,
} = storeToRefs(useLayoutStore())
const { switchMenuExpanded } = useLayoutStore()

const menuClasses = computed(() => {
  return {
    'app-vertical-menu__list--hidden': menuHidden.value,
  }
})

const isExpanded = computed({
  get() {
    return isMenuExpanded.value
  },
  set(value) {
    switchMenuExpanded(value)
  },
})

</script>
<template>
<div class="app-vertical-menu">
  <RouterLink
    to="/"
    class="app-vertical-menu__logo-link"
    :tabindex="isMenuVertical ? 1 : -1"
  >
    <img
      class="app-vertical-menu__logo"
      src="/logo.png"
      alt="app logo"
    />
  </RouterLink>
  <div
    class="app-vertical-menu__list-wrapper"
    ref="appMenuWrapper"
  >
    <div
      class="app-vertical-menu__list"
      ref="appMenu"
      :class="menuClasses"
    >
      <MainMenu :tabindex="isMenuVertical ? 2 : -1" />
    </div>
  </div>

  <div class="app-vertical-menu__profile" ref="profileMenuRef">
    <a
      href="#"
      class="app-vertical-menu__profile-link"
      :tabindex="isMenuVertical ? 3 : -1"
      @click.prevent="toggleProfile"
    >
      <span class="app-vertical-menu__profile-link-icon"><fa icon="user" /></span>
      <span class="app-vertical-menu__profile-link-label">profile</span>
    </a>

    <div
      v-if="profileOpen"
      class="app-vertical-menu__profile-dropdown"
    >
      <div class="app-vertical-menu__profile-dropdown-header">
        {{ displayName }}
      </div>
      <div class="app-vertical-menu__profile-dropdown-buttons">
        <UiButton
          :tabindex="isMenuVertical ? 3 : -1"
          @click="profileOpen = false; $router.push('/profile')"
        >Profile</UiButton>
        <UiButton
          :tabindex="isMenuVertical ? 3 : -1"
          @click="profileOpen = false; $router.push('/preferences')"
        >Preferencje</UiButton>
        <UiButton
          :loading="logoutLoading"
          :tabindex="isMenuVertical ? 3 : -1"
          @click="logout"
        >Logout</UiButton>
      </div>
    </div>
  </div>

  <span class="app-vertical-menu__expand-toggle">
    <UiSwitch
      v-model="isExpanded"
      :tabindex="isMenuVertical ? 4 : -1"
    >collapse</UiSwitch>
  </span>
</div>
</template>
