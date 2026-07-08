import type { Router } from 'express'

import { getVersion } from '@/controllers/version.controller'



export default (router: Router) => {
  router.route('/version')
    .get(getVersion)
}
