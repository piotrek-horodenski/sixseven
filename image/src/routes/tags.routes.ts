import type { Router } from 'express'

import {
  getTags,
  addTag,
  removeTag,
} from '@/controllers/tag.controller'
import { requireAuth } from '@/middleware/auth'

export default (router: Router) => {
  router.route('/tags')
    .get(getTags)
    .post(requireAuth, addTag)
  router.route('/tags/:id')
    .delete(requireAuth, removeTag)
}
