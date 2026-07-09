import { Router } from 'express'

import photosRoutes from './photos.routes'
import thumbsRoutes from './thumbs.routes'
import tagsRoutes from './tags.routes'
import collectionsRoutes from './collections.routes'
import versionRoutes from './version.routes'



const routes = [
  photosRoutes,
  thumbsRoutes,
  tagsRoutes,
  collectionsRoutes,
  versionRoutes,
]

const router = Router()

routes.forEach(route => {
  route(router)
})

export default router
