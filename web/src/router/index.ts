import { createRouter, createWebHistory } from 'vue-router'

import { routes } from './routes'
import { guards } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

guards.forEach(guard => router.beforeEach(guard))

export default router
