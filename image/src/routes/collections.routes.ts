import type { Router } from 'express'

import {
  getCollections,
  addCollection,
  removeCollection,
} from '@/controllers/collection.controller'
import { requireAuth } from '@/middleware/auth'

export default (router: Router) => {
  router.route('/collections')
    .get(getCollections)
    .post(requireAuth, addCollection)
  router.route('/collections/:id')
    .delete(requireAuth, removeCollection)
}
