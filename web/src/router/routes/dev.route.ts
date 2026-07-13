import type { RouteRecordRaw } from 'vue-router'

import DevIntro from '@/modules/dev/DevIntro.vue'
import DevGamesView from '@/modules/dev/DevGamesView.vue'

// Jawna adnotacja zamiast `satisfies` — uzasadnienie w admin.route.ts.
// Widok dewelopera „Moje gry" (Etap 4d): dostępny dla KAŻDEGO zalogowanego
// usera (CTA `dev:enroll` jest self-service — rola developer nadawana od ręki),
// więc bez `meta.requiredPermission`.
const devRoute: RouteRecordRaw = {
  path: '/dev',
  name: 'dev-games',
  components: {
    intro: DevIntro,
    default: DevGamesView,
  },
}

export default devRoute
