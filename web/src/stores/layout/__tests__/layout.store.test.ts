import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { EMenuType, EMenuVariant, ETheme } from '../layout.model'

import { useLayoutStore } from '../layout.store'

describe('layout store', () => {
  let store: ReturnType<typeof useLayoutStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
    store = useLayoutStore()
  })

  describe('initial state', () => {
    it('has all named slots', () => {
      const names = store.slots.map(s => s.name)
      expect(names).toContain('submenu')
      expect(names).toContain('messages')
      expect(names).toContain('intro')
      expect(names).toContain('sidebar')
      expect(names).toContain('header')
      expect(names).toContain('aside')
      expect(names).toContain('default')
      expect(names).toContain('footer')
    })

    it('starts with horizontal menu', () => {
      expect(store.menuType).toBe(EMenuType.horizontal)
      expect(store.menuVariant).toBe(EMenuVariant.default)
    })
  })

  describe('menu computed properties', () => {
    it('isMenuHorizontal is true for horizontal + visible', () => {
      store.menuType = EMenuType.horizontal
      store.menuVariant = EMenuVariant.default
      expect(store.isMenuHorizontal).toBe(true)
    })

    it('isMenuHorizontal is false when hidden', () => {
      store.menuType = EMenuType.horizontal
      store.menuVariant = EMenuVariant.hidden
      expect(store.isMenuHorizontal).toBe(false)
    })

    it('isMenuVertical is true for vertical + visible', () => {
      store.menuType = EMenuType.vertical
      store.menuVariant = EMenuVariant.default
      expect(store.isMenuVertical).toBe(true)
    })

    it('isMenuVertical is false for horizontal', () => {
      store.menuType = EMenuType.horizontal
      expect(store.isMenuVertical).toBe(false)
    })

    it('isMenuExpanded is true for vertical + expanded', () => {
      store.menuType = EMenuType.vertical
      store.menuVariant = EMenuVariant.expanded
      expect(store.isMenuExpanded).toBe(true)
    })

    it('isMenuExpanded is false for vertical + default', () => {
      store.menuType = EMenuType.vertical
      store.menuVariant = EMenuVariant.default
      expect(store.isMenuExpanded).toBe(false)
    })
  })

  describe('theme', () => {
    it('sets dark class on document when theme is dark', () => {
      store.theme = ETheme.dark
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('sets light class on document when theme is light', () => {
      store.theme = ETheme.light
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('loads theme from localStorage on init', () => {
      localStorage.setItem('hydra-theme', 'dark')
      // Re-create store to trigger init
      setActivePinia(createPinia())
      const freshStore = useLayoutStore()
      expect(freshStore.theme).toBe(ETheme.dark)
    })

    it('persists theme to localStorage when changed (regression)', () => {
      store.theme = ETheme.dark
      expect(localStorage.getItem('hydra-theme')).toBe(ETheme.dark)

      store.theme = ETheme.light
      expect(localStorage.getItem('hydra-theme')).toBe(ETheme.light)
    })

    it('persisted theme survives a store re-create', () => {
      store.theme = ETheme.dark
      setActivePinia(createPinia())
      const freshStore = useLayoutStore()
      expect(freshStore.theme).toBe(ETheme.dark)
    })
  })

  describe('switchMenuExpanded', () => {
    it('sets expanded variant for vertical menu', () => {
      store.menuType = EMenuType.vertical
      store.switchMenuExpanded(true)
      expect(store.menuVariant).toBe(EMenuVariant.expanded)
    })

    it('sets default variant when collapsing', () => {
      store.menuType = EMenuType.vertical
      store.menuVariant = EMenuVariant.expanded
      store.switchMenuExpanded(false)
      expect(store.menuVariant).toBe(EMenuVariant.default)
    })

    it('does nothing for horizontal menu', () => {
      store.menuType = EMenuType.horizontal
      store.menuVariant = EMenuVariant.default
      store.switchMenuExpanded(true)
      expect(store.menuVariant).toBe(EMenuVariant.default)
    })
  })

  describe('switchMenuType', () => {
    it('does nothing when already that type', () => {
      store.menuType = EMenuType.horizontal
      store.menuVariant = EMenuVariant.default
      store.switchMenuType(EMenuType.horizontal)
      // Should stay default, not transition to hidden
      expect(store.menuVariant).toBe(EMenuVariant.default)
    })

    it('sets variant to hidden immediately', () => {
      store.menuType = EMenuType.horizontal
      store.switchMenuType(EMenuType.vertical)
      expect(store.menuVariant).toBe(EMenuVariant.hidden)
    })

    it('changes type after timeout', async () => {
      vi.useFakeTimers()
      store.menuType = E