import GamesView from '@/modules/games/GamesView.vue'
import GamesIntro from '@/modules/games/GamesIntro.vue'
import MatchView from '@/modules/games/MatchView.vue'

export default {
  path: '/play',
  children: [
    {
      path: '',
      name: 'games',
      components: {
        intro: GamesIntro,
        default: GamesView,
      },
    },
    {
      path: ':id',
      name: 'games-match',
      components: {
        intro: GamesIntro,
        default: MatchView,
      },
    },
  ],
}
