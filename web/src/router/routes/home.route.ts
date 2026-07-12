import Home from '@/modules/home/HomeView.vue'
import HomeIntro from '@/modules/home/HomeIntro.vue'
import FriendsAsidePanel from '@/modules/social/FriendsAsidePanel.vue'

// Home = grid kwadratowych kafelków: „Nowa gra" (→ /new) + otwarte gry innych
// + moje gry w toku. Scala dawne /rooms i /play.
// Slot `aside` = panel znajomych (Etap 4a): lista + status live + zaproszenia.
export default {
  path: '/',
  name: 'home',
  components: {
    intro: HomeIntro,
    default: Home,
    aside: FriendsAsidePanel,
  },
}
