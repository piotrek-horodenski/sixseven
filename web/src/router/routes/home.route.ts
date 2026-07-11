import Home from '@/modules/home/HomeView.vue'
import HomeIntro from '@/modules/home/HomeIntro.vue'

// Home = pełny hub (kafelki pokoi/gier + „Nowa gra"), scala dawne /rooms i /play.
export default {
  path: '/',
  name: 'home',
  components: {
    intro: HomeIntro,
    default: Home,
  },
}
