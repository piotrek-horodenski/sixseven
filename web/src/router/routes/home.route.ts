import Home from '@/modules/home/HomeView.vue'
import HomeIntro from '@/modules/home/HomeIntro.vue'

// Home = grid kwadratowych kafelków: „Nowa gra" (→ /new) + otwarte gry innych
// + moje gry w toku. Scala dawne /rooms i /play.
export default {
  path: '/',
  name: 'home',
  components: {
    intro: HomeIntro,
    default: Home,
  },
}
