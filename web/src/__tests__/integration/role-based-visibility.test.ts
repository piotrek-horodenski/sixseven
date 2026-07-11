import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'

const { socketRef } = vi.hoisted(() => {
  const socketRef: { current: any } = { current: null }
  return { socketRef }
})

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketRef.current),
}))

// Mock the default router to prevent gate.store.ts from creating a real router on import
vi.mock('@/router', () => ({
  default: { push: vi.fn(), beforeEach: vi.fn() },
}))

import { SocketSimulator } from '../helpers/socket-simulator'
import { routes } from '@/router/routes'
import { guards } from '@/router/guards'
import { useGateStore } from '@/stores/gate/gate.store'
import MainMenu from '@/modules/layout/MainMenu.vue'
import AppMenu from '@/modules/layout/AppMenu.vue'
import AdminSubmenu from '@/modules/admin/AdminSubmenu.vue'

// Minimal stubs
const Stub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const globalConfig = {
  stubs: {
    fa: defineComponent({
      props: ['icon'],
      setup(props) { return () => h('i', { class: `fa-${props.icon}` }) },
    }),
    UiProgress: Stub,
    UiButton: Stub,
    UiGeneralTransition: defineComponent({
      inheritAttrs: false,
      setup(_, { slots }) { return () => slots.default?.() },
    }),
  },
  directives: {
    tooltip: () => {},
  },
}

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  guards.forEach(guard => router.beforeEach(guard))
  return router
}

function loginAs(permissions: string[]) {
  const gate = useGateStore()
  gate.user = { _id: 'u1', username: 'testuser', permissions }
  gate.isAuthenticated = true
  gate.authToken = 'test-token'
}

async function mountMenu(router: Router, permissions: string[]) {
  loginAs(permissions)
  router.push('/')
  await router.isReady()
  return mount(MainMenu, {
    global: {
      plugins: [router],
      ...globalConfig,
    },
  })
}

// AppMenu = pasek górny (logo + MainMenu + dropdown profilu). Admin/Images
// wróciły do MainMenu; dropdown profilu ma już tylko Profile/Logout.
async function mountAppMenuWithProfileOpen(router: Router, permissions: string[]) {
  loginAs(permissions)
  router.push('/')
  await router.isReady()
  const wrapper = mount(AppMenu, {
    global: {
      plugins: [router],
      ...globalConfig,
    },
  })
  await wrapper.find('.app-menu__profile-link').trigger('click')
  return wrapper
}

async function mountAdminSubmenu(router: Router, permissions: string[]) {
  loginAs(permissions)
  router.push('/admin/users')
  await router.isReady()
  return mount(AdminSubmenu, {
    global: {
      plugins: [router],
      ...globalConfig,
    },
  })
}

describe('role-based visibility', () => {
  let router: Router

  beforeEach(() => {
    socketRef.current = new SocketSimulator().socket
    setActivePinia(createPinia())
    router = createTestRouter()
  })

  describe('MainMenu visibility', () => {
    // Menu górne = Home + (guardowane) Images/Admin (Etap 3, pkt 2+3, korekta).
    // Controls/Typography usunięte na stałe.
    it('admin with all permissions sees Home, Images and Admin', async () => {
      const wrapper = await mountMenu(router, [
        'view-admin', 'access-images',
        'manage-users', 'manage-roles', 'manage-settings',
      ])

      expect(wrapper.find('a[href="/"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/images"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin"]').exists()).toBe(true)
      expect(wrapper.findAll('a')).toHaveLength(3)
    })

    it('user with no special permissions sees only Home', async () => {
      const wrapper = await mountMenu(router, [])

      expect(wrapper.find('a[href="/"]').exists()).toBe(true)
      expect(wrapper.findAll('a')).toHaveLength(1)
      expect(wrapper.find('a[href="/controls"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/typo"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/images"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
    })

    it('user with only access-images sees Home + Images, not Admin', async () => {
      const wrapper = await mountMenu(router, ['access-images'])

      expect(wrapper.find('a[href="/images"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
    })

    it('user with only view-admin sees Home + Admin, not Images', async () => {
      const wrapper = await mountMenu(router, ['view-admin'])

      expect(wrapper.find('a[href="/admin"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/images"]').exists()).toBe(false)
    })
  })

  describe('AppMenu profile dropdown', () => {
    // Dropdown profilu ma już tylko Profile/Logout — Images/Admin wróciły do MainMenu.
    it('does not contain Images or Admin even with all permissions', async () => {
      const wrapper = await mountAppMenuWithProfileOpen(router, [
        'view-admin', 'access-images',
        'manage-users', 'manage-roles', 'manage-settings',
      ])

      expect(wrapper.text()).toContain('Profile')
      expect(wrapper.text()).toContain('Logout')
      expect(wrapper.find('.app-menu__profile-menu-buttons').text()).not.toContain('Images')
      expect(wrapper.find('.app-menu__profile-menu-buttons').text()).not.toContain('Admin')
    })
  })

  describe('AdminSubmenu visibility', () => {
    it('admin with all admin permissions sees all tabs', async () => {
      const wrapper = await mountAdminSubmenu(router, [
        'view-admin', 'manage-users', 'manage-roles', 'manage-settings',
      ])

      expect(wrapper.find('a[href="/admin/users"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin/roles"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin/settings"]').exists()).toBe(true)
    })

    it('admin with only manage-users sees Users but not Roles or Settings', async () => {
      const wrapper = await mountAdminSubmenu(router, ['view-admin', 'manage-users'])

      expect(wrapper.find('a[href="/admin/users"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin/roles"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/admin/settings"]').exists()).toBe(false)
    })

    it('admin with manage-roles but not manage-users sees Roles only', async () => {
      const wrapper = await mountAdminSubmenu(router, ['view-admin', 'manage-roles'])

      expect(wrapper.find('a[href="/admin/users"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/admin/roles"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin/settings"]').exists()).toBe(false)
    })
  })

  describe('route guard redirects', () => {
    it('unauthenticated user is redirected to /login', async () => {
      router.push('/')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('unauthenticated user accessing /admin is redirected to /login', async () => {
      router.push('/admin')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('unauthenticated user accessing /images is redirected to /login', async () => {
      router.push('/images')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('authenticated user on /login is redirected to /', async () => {
      loginAs(['access-images'])
      router.push('/login')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('authenticated user on /register is redirected to /', async () => {
      loginAs([])
      router.push('/register')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('user without access-images is redirected from /images', async () => {
      loginAs([])
      router.push('/images')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('user without view-admin is redirected from /admin', async () => {
      loginAs(['access-images'])
      router.push('/admin/users')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('user with view-admin but not manage-users is redirected from /admin/users', async () => {
      loginAs(['view-admin', 'manage-roles'])
      router.push('/admin/users')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('user with view-admin and manage-users can access /admin/users', async () => {
      loginAs(['view-admin', 'manage-users'])
      router.push('/admin/users')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/admin/users')
    })

    it('user with access-images can access /images', async () => {
      loginAs(['access-images'])
      router.push('/images')
      await router.isReady()

      expect(router.currentRoute.value.path).toBe('/images')
    })
  })

  describe('cross-permission combinations', () => {
    it('user with images sees Images but not Admin (main menu)', async () => {
      const wrapper = await mountMenu(router, ['access-images'])

      expect(wrapper.find('a[href="/images"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
    })

    it('user can navigate between allowed sections', async () => {
      loginAs(['access-images', 'view-admin', 'manage-users'])

      await router.push('/images')
      expect(router.currentRoute.value.path).toBe('/images')

      await router.push('/admin/users')
      expect(router.currentRoute.value.path).toBe('/admin/users')
    })

    it('user with all admin sub-permissions can navigate admin tabs', async () => {
      loginAs(['view-admin', 'manage-users', 'manage-roles', 'manage-settings'])

      await router.push('/admin/users')
      expect(router.currentRoute.value.path).toBe('/admin/users')

      await router.push('/admin/roles')
      expect(router.currentRoute.value.path).toBe('/admin/roles')

      await router.push('/admin/settings')
      expect(router.currentRoute.value.path).toBe('/admin/settings')
    })
  })
})
