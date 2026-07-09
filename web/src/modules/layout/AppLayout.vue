<script setup lang="ts">

import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useLayoutStore } from '@/stores/layout/layout.store'
import { useGateStore } from '@/stores/gate/gate.store'
import { useColorPresetsStore } from '@/stores/color-presets/color-presets.store'
import { useGamesStore } from '@/stores/games/games.store'
import RegularSlot from './RegularSlot.vue'
import AppMenu from './AppMenu.vue'
import AppVerticalMenu from './AppVerticalMenu.vue'
import { RouteSlotState } from '@/stores/layout/layout.model'

const {
  isMenuHorizontal,
  isMenuVertical,
  isMenuExpanded,
  slots,
} = storeToRefs(useLayoutStore())

const { connected } = storeToRefs(useGateStore())

onMounted(() => {
  useColorPresetsStore().init()
  useGamesStore().init()
})

const layoutClasses = computed(() => {
  return {
    'app-layout--with-menu-horizontal': isMenuHorizontal.value,
    'app-layout--with-menu-vertical': isMenuVertical.value,
    'app-layout--with-menu-vertical-expanded': isMenuVertical.value && isMenuExpanded.value,
  }
})

const menuHorizontalClasses = computed(() => {
  return {
    'app-layout__menu-horizontal--visible': isMenuHorizontal.value,
  }
})

const menuVerticalClasses = computed(() => {
  return {
    'app-layout__menu-vertical--visible': isMenuVertical.value,
    'app-layout__menu-vertical--expanded': isMenuVertical.value && isMenuExpanded.value,
  }
})

const sidebarClasses = computed(() => {
  const slot = slots.value.find(slot => slot.name === 'sidebar')

  if (!slot) {
    return {}
  }
  return {
    'has-content': slot.state !== RouteSlotState.empty &&
      slot.state !== RouteSlotState.disappearing
  }
})

const sidebarContentClasses = computed(() => {
  const slot = slots.value.find(slot => slot.name === 'sidebar')

  if (!slot) {
    return {}
  }
  return {
    'has-content': slot.state !== RouteSlotState.empty &&
      slot.state !== RouteSlotState.disappearing
  }
})

const asideClasses = computed(() => {
  const slot = slots.value.find(slot => slot.name === 'aside')

  if (!slot) {
    return {}
  }
  return {
    'has-content': slot.state !== RouteSlotState.empty &&
      slot.state !== RouteSlotState.disappearing
  }
})

const asideContentClasses = computed(() => {
  const slot = slots.value.find(slot => slot.name === 'aside')

  if (!slot) {
    return {}
  }
  return {
    'has-content': slot.state !== RouteSlotState.empty &&
      slot.state !== RouteSlotState.disappearing
  }
})

</script>
<template>
<main
  class="app-layout"
  :class="layoutClasses"
>
  <UiProgress
    :show="!connected"
  />
  <div class="app-layout__submenu">
    <RouterView
      name="submenu"
      v-slot="{ Component }"
    >
      <RegularSlot name="submenu">
        <component :is="Component" />
      </RegularSlot>
    </RouterView>
  </div>
  <div class="app-layout__messages">
    <RouterView
      name="messages"
      v-slot="{ Component }"
    >
      <RegularSlot name="messages">
        <component :is="Component" />
      </RegularSlot>
    </RouterView>
  </div>
  <div class="app-layout__intro">
    <RouterView
      name="intro"
      v-slot="{ Component }"
    >
      <RegularSlot name="intro">
        <component :is="Component" />
      </RegularSlot>
    </RouterView>
  </div>
  <div class="app-layout__subintro">
    <RouterView
      name="subintro"
      v-slot="{ Component }"
    >
      <RegularSlot name="subintro">
        <component :is="Component" />
      </RegularSlot>
    </RouterView>
  </div>
  <div class="app-layout__main-content">
    <div
      class="app-layout__sidebar"
      :class="sidebarClasses"
    >
      <div
        class="app-layout__sidebar-content"
        :class="sidebarContentClasses"
      >
        <RouterView
          name="sidebar"
          v-slot="{ Component }"
        >
          <RegularSlot name="sidebar">
            <component :is="Component" />
          </RegularSlot>
        </RouterView>
      </div>
    </div>
    <div class="app-layout__workspace">
      <div class="app-layout__controls">
        <RouterView
          name="controls"
          v-slot="{ Component }"
        >
          <RegularSlot name="controls">
            <component :is="Component" />
          </RegularSlot>
        </RouterView>
      </div>
      <div class="app-layout__workspace-row">
        <div class="app-layout__main">
          <div class="app-layout__header">
            <RouterView
              name="header"
              v-slot="{ Component }"
            >
              <RegularSlot name="header">
                <component :is="Component" />
              </RegularSlot>
            </RouterView>
          </div>
          <div class="app-layout__default">
            <RouterView
              v-slot="{ Component }"
            >
              <RegularSlot>
                <component :is="Component" />
              </RegularSlot>
            </RouterView>
          </div>
        </div>
        <div
          class="app-layout__aside"
          :class="asideClasses"
        >
          <div class="app-layout__aside-content" :class="asideContentClasses">
            <RouterView
              name="aside"
              v-slot="{ Component }"
            >
              <RegularSlot name="aside">
                <component :is="Component" />
              </RegularSlot>
            </RouterView>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="app-layout__footer">
    <RouterView
      name="footer"
      v-slot="{ Component }"
    >
      <RegularSlot name="footer">
        <component :is="Component" />
      </RegularSlot>
    </RouterView>
  </div>
</main>
<nav>
  <div
    class="app-layout__menu-horizontal"
    :class="menuHorizontalClasses"
  >
    <AppMenu />
  </div>
  <div
    class="app-layout__menu-vertical"
    :class="menuVerticalClasses"
  >
    <AppVerticalMenu />
  </div>
</nav>
</template>
