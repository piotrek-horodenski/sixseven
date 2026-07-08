import type { Router } from 'express'
import rateLimit from 'express-rate-limit'

import upload from '@/libs/multer'
import { settings } from '@/settings'
import { requireAuth } from '@/middleware/auth'
import {
  getPhotos,
  createPhoto,
  deletePhoto,
  getPhoto,
  getPhotoMeta,
  updatePhoto,
  batchUpdatePhotos,
} from '@/controllers/photo.controller'

const uploadLimiter = rateLimit({
  windowMs: settings.rateLimitWindowMs,
  limit: settings.rateLimitUploadMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

export default (router: Router) => {
  router.route('/photos')
    .get(getPhotos)
    .post(requireAuth, uploadLimiter, upload.single('image'), createPhoto)
  router.route('/photos/batch/update')
    .post(requireAuth, batchUpdatePhotos)

  router.route('/photos/:id')
    .get(getPhoto)
    .delete(requireAuth, deletePhoto)
    .put(requireAuth, updatePhoto)

  router.route('/photos/:id/meta')
    .get(getPhotoMeta)
}
