import type { RouteRecordRaw } from 'vue-router'

import GameRankingView from '@/modules/games/GameRankingView.vue'

// Jawna adnotacja zamiast `satisfies` — uzasadnienie w admin.route.ts.
// Ranking gry (Etap 4e): top 50 wg ELO z subskrypcji `ratings` po gameId.
// Dostępny dla zalogowanych (brak meta.open/public → guard wymaga sesji).
const gameRankingRoute: RouteRecordRaw = {
  path: '/ranking/:gameId',
  name: 'game-ranking',
  components: { default: GameRankingView },
}

export default gameRankingRoute
