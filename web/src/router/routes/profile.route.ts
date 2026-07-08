import ProfileEditView from '@/modules/profile/ProfileEditView.vue'
import PasswordChangeView from '@/modules/profile/PasswordChangeView.vue'
import ProfileSubmenu from '@/modules/profile/ProfileSubmenu.vue'
import ProfileEditIntro from '@/modules/profile/ProfileEditIntro.vue'
import PasswordChangeIntro from '@/modules/profile/PasswordChangeIntro.vue'

export default {
  path: '/profile',
  redirect: '/profile/edit',
  children: [
    {
      path: 'edit',
      name: 'profile-edit',
      components: { intro: ProfileEditIntro, default: ProfileEditView, submenu: ProfileSubmenu },
      meta: {

        animation: {
          intro: {
            'profile-password': 'slide-right',
          },
          default: {
            'profile-password': 'slide-right',
          },
        },
      },
    },
    {
      path: 'password',
      name: 'profile-password',
      components: { intro: PasswordChangeIntro, default: PasswordChangeView, submenu: ProfileSubmenu },
      meta: {

        animation: {
          intro: {
            'profile-edit': 'slide-left',
          },
          default: {
            'profile-edit': 'slide-left',
          },
        },
      },
    },
  ],
}
