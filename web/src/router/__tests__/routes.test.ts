import { describe, it, expect, vi } from 'vitest'

// Mock all Vue component imports to avoid triggering store/router initialization
vi.mock('@/modules/admin/AdminUsersView.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminRolesView.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminSettingsView.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminSubmenu.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminBreadcrumb.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/UserEditPanel.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/RoleEditPanel.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesView.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesSubmenu.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesSidebar.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImageEditPanel.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesBatchPanel.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesBatchFooter.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesToolbar.vue', () => ({ default: {} }))
vi.mock('@/modules/images/ImagesIntro.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminUsersIntro.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminRolesIntro.vue', () => ({ default: {} }))
vi.mock('@/modules/admin/AdminSettingsIntro.vue', () => ({ default: {} }))
vi.mock('@/modules/auth/LoginView.vue', () => ({ default: {} }))
vi.mock('@/modules/auth/RegisterView.vue', () => ({ default: {} }))
vi.mock('@/modules/layout/HomeView.vue', () => ({ default: {} }))
vi.mock('@/modules/layout/ProfileView.vue', () => ({ default: {} }))

import adminRoute from '../routes/admin.route'
import imagesRoute from '../routes/images.route'
import loginRoute from '../routes/login.route'
import registerRoute from '../routes/register.route'

describe('route configuration', () => {
  describe('public routes', () => {
    it('login is public at /login', () => {
      expect(loginRoute.path).toBe('/login')
      expect(loginRoute.name).toBe('login')
      expect(loginRoute.meta?.public).toBe(true)
    })

    it('register is public at /register', () => {
      expect(registerRoute.path).toBe('/register')
      expect(registerRoute.name).toBe('register')
      expect(registerRoute.meta?.public).toBe(true)
    })
  })

  describe('admin routes', () => {
    it('requires view-admin at parent level', () => {
      expect(adminRoute.meta?.requiredPermission).toBe('view-admin')
    })

    it('redirects to /admin/users', () => {
      expect(adminRoute.redirect).toBe('/admin/users')
    })

    it('admin-users requires manage-users', () => {
      const users = adminRoute.children.find((c: any) => c.name === 'admin-users')
      expect(users?.meta?.requiredPermission).toBe('manage-users')
    })

    it('admin-roles requires manage-roles', () => {
      const roles = adminRoute.children.find((c: any) => c.name === 'admin-roles')
      expect(roles?.meta?.requiredPermission).toBe('manage-roles')
    })

    it('admin-settings requires manage-settings', () => {
      const settings = adminRoute.children.find((c: any) => c.name === 'admin-settings')
      expect(settings?.meta?.requiredPermission).toBe('manage-settings')
    })

    it('admin-users has slide-right animation from roles and settings', () => {
      const users = adminRoute.children.find((c: any) => c.name === 'admin-users')
      expect(users?.meta?.animation?.default?.['admin-roles']).toBe('slide-right')
      expect(users?.meta?.animation?.default?.['admin-settings']).toBe('slide-right')
    })

    it('admin-settings has slide-left animation from other admin routes', () => {
      const settings = adminRoute.children.find((c: any) => c.name === 'admin-settings')
      expect(settings?.meta?.animation?.default?.['admin-roles']).toBe('slide-left')
      expect(settings?.meta?.animation?.default?.['admin-users']).toBe('slide-left')
    })

    it('user-edit route has aside component', () => {
      const edit = adminRoute.children.find((c: any) => c.name === 'admin-user-edit')
      expect(edit?.components?.aside).toBeDefined()
      expect(edit?.path).toBe('users/:id')
    })

    it('role-new and role-edit routes have aside component', () => {
      const newRole = adminRoute.children.find((c: any) => c.name === 'admin-role-new')
      const editRole = adminRoute.children.find((c: any) => c.name === 'admin-role-edit')
      expect(newRole?.components?.aside).toBeDefined()
      expect(editRole?.components?.aside).toBeDefined()
    })
  })

  describe('images routes', () => {
    it('requires access-images at parent level', () => {
      expect(imagesRoute.meta?.requiredPermission).toBe('access-images')
    })

    it('images-edit has aside panel', () => {
      const edit = imagesRoute.children.find((c: any) => c.name === 'images-edit')
      expect(edit?.components?.aside).toBeDefined()
      expect(edit?.path).toBe(':id')
    })

    it('images-batch has aside panel', () => {
      const batch = imagesRoute.children.find((c: any) => c.name === 'images-batch')
      expect(batch?.components?.aside).toBeDefined()
    })

    it('all images routes have footer component', () => {
      for (const child of imagesRoute.children) {
        expect(child.components?.footer).toBeDefined()
      }
    })

    it('all images routes have sidebar', () => {
      for (const child of imagesRoute.children) {
        expect(child.components?.sidebar).toBeDefined()
      }
    })
  })
})
