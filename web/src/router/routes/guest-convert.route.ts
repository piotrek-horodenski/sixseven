import type { RouteRecordRaw } from 'vue-router'

import GuestConvertView from '@/modules/social/GuestConvertView.vue'

// Jawna adnotacja zamiast `satisfies` — uzasadnienie w admin.route.ts.
// Konwersja gościa `/guest/convert`: gość NIE ma sesji usera, więc
// `open` (osiągalna dla każdego bez redirectu) + `public` (renderowana
// standalone, poza AppLayout, jak `/r/:code` i `/game/rps`).
const guestConvertRoute: RouteRecordRaw = {
  path: '/guest/convert',
  name: 'guest-convert',
  component: GuestConvertView,
  meta: { public: true, open: true },
}

export default guestConvertRoute
