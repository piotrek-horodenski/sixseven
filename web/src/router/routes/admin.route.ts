import AdminUsersView from '@/modules/admin/AdminUsersView.vue'
import AdminRolesView from '@/modules/admin/AdminRolesView.vue'
import AdminSettingsView from '@/modules/admin/AdminSettingsView.vue'
import AdminSubmenu from '@/modules/admin/AdminSubmenu.vue'
import AdminBreadcrumb from '@/modules/admin/AdminBreadcrumb.vue'
import AdminUsersIntro from '@/modules/admin/AdminUsersIntro.vue'
import AdminRolesIntro from '@/modules/admin/AdminRolesIntro.vue'
import AdminSettingsIntro from '@/modules/admin/AdminSettingsIntro.vue'
import UserEditPanel from '@/modules/admin/UserEditPanel.vue'
import RoleEditPanel from '@/modules/admin/RoleEditPanel.vue'

export default {
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
