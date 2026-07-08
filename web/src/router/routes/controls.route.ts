import Controls from '@/modules/controls/ControlsView.vue'
import ControlsSidebar from '@/modules/controls/ControlsSidebar.vue'
import ControlsIntro from '@/modules/controls/ControlsIntro.vue'

export default {
  path: '/controls',
  name: 'controls',
  components: {
    intro: ControlsIntro,
    default: Controls,
    sidebar: ControlsSidebar,
  },
  meta: {
    animation: {
      intro: {
        typo: 'slide-down',
      },
      default: {
        typo: 'slide-up',
        home: 'only-right',
      },
    },
  },
}
