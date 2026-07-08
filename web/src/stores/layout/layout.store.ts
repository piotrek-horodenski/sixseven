import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteLocation } from 'vue-router'

import { RouteSlot } from './route-slot.class'
import { EMenuType, EMenuVariant, ETheme } from './layout.model'



export const useLayoutStore = defineStore('layout', () => {
  const slots = ref([
    new RouteSlot('submenu'),
    new RouteSlot('messages'),
    new RouteSlot('intro'),
    new RouteSlot('subintro'),
    new RouteSlot('sidebar'),
    new RouteSlot('header'),
    new RouteSlot('aside'),
    new RouteSlot('default'),
    new RouteSlot('footer'),
  ])
  const menuType = ref(EMenuType.horizontal)
  const menuVariant = ref(EMenuVariant.default)
  const scrollbarWidth = ref(0)
  const _theme: Ref<ETheme> = ref(ETheme.light)

  const theme = computed({
    get() {
      return _theme.value
    },
    set(value) {
      _theme.value = value
      changeMode()
    },
  })

  const isMenuHorizontal = computed(() => {
    return menuType.value === EMenuType.horizontal &&
      menuVariant.value !== EMenuVariant.hidden
  })
  const isMenuVertical = computed(() => {
    return menuType.value === EMenuType.vertical &&
      menuVariant.value !== EMenuVariant.hidden
  })
  const isMenuExpanded = computed(() => {
    return menuType.value === EMenuType.vertical &&
      menuVariant.value === EMenuVariant.expanded
  })

  function changeMode() {
    if (_theme.value === ETheme.dark) {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
    // Persist the choice so it survives reloads — initTheme() reads this key.
    // Previously the theme was applied but never saved (bug: no persistence).
    try {
      localStorage.setItem('hydra-theme', _theme.value)
    } catch {
      // localStorage may be unavailable (private mode / SSR) — non-fatal.
    }
  }

  function setScrollbarWidth(width: number) {
    scrollbarWidth.value = width
  }

  function getScrollbarWidth() {
    const outer = document.createElement('div')
    outer.style.visibility = 'hidden'
    outer.style.overflow = 'scroll'
    outer.style.width = '100px'
    outer.style.height = '100px'
    // @ts-ignore
    outer.style.msOverflowStyle = 'scrollbar'
    document.body.appendChild(outer)

    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.height = '200px'
    outer.appendChild(inner)

    const scrollbarWidth = outer.offsetWidth - outer.clientWidth

    if (outer.parentNode) {
      outer.parentNode.removeChild(outer)
    }

    return scrollbarWidth
  }

  function initTheme() {
    if (localStorage.getItem('hydra-theme')) {
      _theme.value = localStorage.getItem('hydra-theme') as ETheme
    } else if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      _theme.value = ETheme.dark
    }
    changeMode()
  }

  async function onRouteChange(to: RouteLocation, from: RouteLocation) {
    slots.value.forEach(slot => {
      slot.routeChange(to, from)
    })
  }

  function switchMenuType(value: EMenuType) {
    if (menuType.value === value) {
      return
    }

    menuVariant.value = EMenuVariant.hidden

    setTimeout(() => {
      menuType.value = value
      requestAnimationFrame(() => {
        menuVariant.value = EMenuVariant.default
      })
    }, 50)
  }

  function switchMenuExpanded(value: boolean) {
    if (menuType.value === EMenuType.horizontal) {
      return
    }

    menuVariant.value = value ? EMenuVariant.expanded : EMenuVariant.default
