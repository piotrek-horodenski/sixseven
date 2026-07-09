import GameRpsView from '@/modules/game-app/GameRpsView.vue'

export default {
  path: '/game/rps',
  name: 'game-rps',
  component: GameRpsView,
  // `open`: aplikacja gry działa na tokenie meczu (user LUB gość) — brak redirectu.
  // `public`: renderowana standalone (poza AppLayout, bez menu).
  meta: { public: true, open: true },
}
