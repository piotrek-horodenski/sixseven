import type { Router } from 'express'

import { getThumb } from '@/controllers/thumb.controller'



export default (router: Router) => {
  router.route('/thumbs/:id')
    .get(getThumb)
}