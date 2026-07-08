<script setup lang="ts">

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import MainMenu from './MainMenu.vue'
import { useLayoutStore } from '@/stores/layout/layout.store'
import { useProfileMenu } from './useProfileMenu'

const { isMenuHorizontal } = storeToRefs(useLayoutStore())
const { profileOpen, profileMenuRef, displayName, toggleProfile, logout } = useProfileMenu()

const appMenu = ref(null)
const appMenuWrapper = ref(null)
const appMenuToggle = ref<HTMLElement | null>(null)
const { width } = useWindowSize()
const menuHidden = ref(false)
const mobileMenuOpen = ref(false)

const observer = new ResizeObserver(checkMenuOnResize)

const menuClasses = computed(() => {
  return {
    'app-menu__list--hidden': menuHidden.value,
  }
})

function checkMenuOnResize() {
  if (
    !appMenuWrapper.value ||
    !appMenu.value
  ) {
    return
  }

  const menuWrapperEl = appMenuWrapper.value as HTMLElement
  const menuEl = appMenu.value as HTMLElement

  const menuRect = menuEl.getBoundingClientRect()
  const menuWrapperRect = menuWrapperEl.getBoundingClientRect()
  let toggleWidth = 0

  if (appMenuToggle.value) {
    const toggleRect = appMenuToggle.value.getBoundingClientRect()
    toggleWidth = toggleRect.width
  }

  menuHidden.value = menuRect.width > menuWrapperRect.width + toggleWidth
}

function observeCallback(value: HTMLElement | null) {
  if (!value) {
    return
  }

  observer.unobserve(value)
  observer.observe(value)
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

watch(width, checkMenuOnResize)
watch(appMenuWrapper, observeCallback)
watch(appMenu, observeCallback)

onMounted(() => {
  checkMenuOnResize()
})

onUnmounted(() => {
  observer.disconnect()
})

</script>
<template>
<div class="app-menu">
  <div v-if="menuHidden" class="app-menu__toggle-wrapper">
    <a
      href="#"
      class="app-menu__toggle"
      ref="appMenuToggle"
      :tabindex="isMenuHorizontal ? 1 : -1"
      @click.prevent="toggleMobileMenu"
    >
      <fa icon="bars" />
    </a>
    <div v-if="mobileMenuOpen" class="app-menu__toggle-menu">
      <MainMenu
        :tabindex="isMenuHorizontal ? 2 : -1"
        @on-select="mobileMenuOpen = false"
      />
    </div>
  </div>
  <RouterLink
    to="/"
    class="app-menu__logo-link"
    :tabindex="isMenuHorizontal ? 1 : -1"
  >
    <img
      class="app-menu__logo"
      src="/logo.png"
      alt="app logo"
    />
  </RouterLink>
  <div
    class="app-menu__list-wrapper"
    ref="appMenuWrapper"
  >
    <div
      class="app-menu__list"
      ref="appMenu"
      :class="menuClasses"
    >
      <MainMenu :tabindex="isMenuHorizontal ? 2 : -1" />
    </div>
  </div>

  <div class="app-menu__profile-wrapper" ref="profileMenuRef">
    <a
      href="#"
      class="app-menu__profile-link"
      :tabindex="isMenuHorizontal ? 3 : -1"
      @click.prevent="toggleProfile"
    >
      <fa icon="user" />
    </a>

    <div v-if="profileOpen" class="app-menu__profile-menu">
      <div class="app-menu__profile-menu-header">
        {{ displayName }}
      </div>
      <div class="app-menu__profile-menu-buttons">
        <UiButton @click="profileOpen = false; $router.push('/profile')">Profile</UiButton>
        <UiButton @click="logout">Logout</UiButton>
      </div>
    </div>
  </div>
</div>
</template>
