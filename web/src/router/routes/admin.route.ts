import type { RouteRecordRaw } from 'vue-router'

import AdminUsersView from '@/modules/admin/AdminUsersView.vue'
import AdminRolesView from '@/modules/admin/AdminRolesView.vue'
import AdminSettingsView from '@/modules/admin/AdminSettingsView.vue'
import AdminGamesView from '@/modules/admin/AdminGamesView.vue'
import AdminGamesIntro from '@/modules/admin/AdminGamesIntro.vue'
import AdminSubmenu from '@/modules/admin/AdminSubmenu.vue'
import AdminBreadcrumb from '@/modules/admin/AdminBreadcrumb.vue'
import AdminUsersIntro from '@/modules/admin/AdminUsersIntro.vue'
import AdminRolesIntro from '@/modules/admin/AdminRolesIntro.vue'
import AdminSettingsIntro from '@/modules/admin/AdminSettingsIntro.vue'
import UserEditPanel from '@/modules/admin/UserEditPanel.vue'
import RoleEditPanel from '@/modules/admin/RoleEditPanel.vue'

// Jawna adnotacja (NIE `satisfies`): satisfies sprawdza literał kontekstowo
// i przechodzi, ale eksport zachowuje typ wywnioskowany — dzieci z/bez `aside`
// sklejają się w unię z `aside?: undefined`, która w routes/index.ts (bez
// kontekstu) nie przechodzi jako RouteRecordRaw (TS2322). Adnotacja ustala
// typ eksportu na RouteRecordRaw. Zweryfikowane na TS 5.6.3 i 6.0.3.
const adminRoute: RouteRecordRaw = {
  path: '/admin',
  redirect: '/admin/users',
  meta: { requiredPermission: 'view-admin' },
  children: [
    {
      path: 'users',
      name: 'admin-users',
      components: { intro: AdminUsersIntro, default: AdminUsersView, submenu: AdminSubmenu, subintro: AdminBreadcrumb },
      meta: {
        requiredPermission: 'manage-users',

        animation: {
          intro: {
            'admin-roles': 'slide-down',
            'admin-role-new': 'slide-down',
            'admin-role-edit': 'slide-down',
            'admin-settings': 'slide-down',
          },
          default: {
            'admin-roles': 'slide-right',
            'admin-role-new': 'slide-right',
            'admin-role-edit': 'slide-right',
            'admin-settings': 'slide-right',
          },
        },
      },
    },
    {
      path: 'users/:id',
      name: 'admin-user-edit',
      components: { intro: AdminUsersIntro, default: AdminUsersView, submenu: AdminSubmenu, subintro: AdminBreadcrumb, aside: UserEditPanel },
      meta: { requiredPermission: 'manage-users' },
    },
    {
      path: 'roles',
      name: 'admin-roles',
      components: { intro: AdminRolesIntro, default: AdminRolesView, submenu: AdminSubmenu, subintro: AdminBreadcrumb },
      meta: {
        requiredPermission: 'manage-roles',

        animation: {
          intro: {
            'admin-settings': 'slide-down',
            'admin-users': 'slide-up',
            'admin-user-edit': 'slide-up',
          },
          default: {
            'admin-settings': 'slide-right',
            'admin-users': 'slide-left',
            'admin-user-edit': 'slide-left',
          },
        },
      },
    },
    {
      path: 'roles/new',
      name: 'admin-role-new',
      components: { intro: AdminRolesIntro, default: AdminRolesView, submenu: AdminSubmenu, subintro: AdminBreadcrumb, aside: RoleEditPanel },
      meta: { requiredPermission: 'manage-roles' },
    },
    {
      path: 'roles/:id',
      name: 'admin-role-edit',
      components: { intro: AdminRolesIntro, default: AdminRolesView, submenu: AdminSubmenu, subintro: AdminBreadcrumb, aside: RoleEditPanel },
      meta: { requiredPermission: 'manage-roles' },
    },
    {
      // Moderacja katalogu gier (4d): approve/unpublish gier zewnętrznych.
      path: 'games',
      name: 'admin-games',
      components: { intro: AdminGamesIntro, default: AdminGamesView, submenu: AdminSubmenu, subintro: AdminBreadcrumb },
      meta: { requiredPermission: 'manage-games' },
    },
    {
      path: 'settings',
      name: 'admin-settings',
      components: { intro: AdminSettingsIntro, default: AdminSettingsView, submenu: AdminSubmenu, subintro: AdminBreadcrumb },
      meta: {
        requiredPermission: 'manage-settings',
        animation: {
          intro: {
            'admin-roles': 'slide-up',
            'admin-role-new': 'slide-up',
            'admin-role-edit': 'slide-up',
            'admin-users': 'slide-up',
            'admin-user-edit': 'slide-up',
          },
          default: {
            'admin-roles': 'slide-left',
            'admin-role-new': 'slide-left',
            'admin-role-edit': 'slide-left',
            'admin-users': 'slide-left',
            'admin-user-edit': 'slide-left',
          },
        },
      },
    },
  ],
}

export default adminRoute
