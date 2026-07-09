import Home from '@/modules/home/HomeView.vue'
import HomeSidebar from '@/modules/home/HomeSidebar.vue'
import HomeMessages from '@/modules/home/HomeMessages.vue'
import HomeIntro from '@/modules/home/HomeIntro.vue'

export default {
  path: '/',
  name: 'home',
  components: {
    intro: HomeIntro,
    default: Home,
    sidebar: HomeSidebar,
    messages: HomeMessages,
  },
  meta: {
    animation: {
      default: {
        typo: 'slide-right',
        controls: 'only-right',
      },
    },
  },
}
