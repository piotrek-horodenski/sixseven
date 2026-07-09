import Settings from '@/modules/settings/SettingsView.vue'
import SettingsIntro from '@/modules/settings/SettingsIntro.vue'

export default {
  path: '/settings',
  name: 'settings',
  components: {
    intro: SettingsIntro,
    default: Settings,
  },
  meta: {
    animation: {
      default: {
        typo: 'slide-right',
        controls: 'only-left',
      },
    },
  },
}
