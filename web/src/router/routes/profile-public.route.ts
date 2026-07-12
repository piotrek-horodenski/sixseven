import type { RouteRecordRaw } from 'vue-router'

import PlayerProfileView from '@/modules/social/PlayerProfileView.vue'

// Jawna adnotacja zamiast `satisfies` — uzasadnienie w admin.route.ts.
// Profil publiczny `/u/:userId`: dostępny dla każdego ZALOGOWANEGO usera
// (brak `meta.open`/`public` → guard wymaga sesji). Renderowany w slocie
// `default` AppLayout.
const profilePublicRoute: RouteRecordRaw = {
  path: '/u/:userId',
  name: 'profile-public',
  components: { default: PlayerProfileView },
}

export default profilePublicRoute
