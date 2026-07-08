import fs from 'fs-extra'
import multer from 'multer'
import path from 'path'
import { v4 as uuid } from 'uuid'

import { settings } from '@/settings'



const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const today = now.toISOString().substring(0, now.toISOString().indexOf('T'))
    const dir = path.join(settings.uploads, today)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }

    return cb(null, dir)
  },
  filename: (req, file, cb) => {
    cb(null, uuid() + path.extname(file.originalname))
  }
})

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',
  'image/svg+xml',
]

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`))
  }
}

export default multer({
  storage,
  fileFilter,
  limits: { fileSize: settings.uploadMaxSize },
});
