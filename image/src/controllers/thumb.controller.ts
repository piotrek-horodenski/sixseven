import { Request, Response } from 'express'
import fs from 'fs-extra'
import sharp from 'sharp'

import Photo from '@/db/models/Photo'
import { mimeTypes } from '@/consts/mime.const'
import { logger } from '@/logger'



export async function getThumb(req: Request, res: Response): Promise<any> {
  const { id } = req.params
  const isPreview = req.query.preview === '1'
  const thumbType = isPreview ? 'preview' : 'thumb'
  if (!id) {
    return res.status(400).json({
      message: 'No Photo id provided',
      status: 3
    })
  }
  try {
    const photo = await Photo.findById(id)
    if (!photo) {
      return res.status(404).json({
        message: 'Photo Not Found',
        status: 2,
      })
    }
    const file = isPreview && photo.previewPath ? photo.previewPath : photo.thumbPath
    res.setHeader('Content-disposition', 'filename*=UTF-8\'\'' + thumbType + '_' + encodeURIComponent(photo.title))
    const metadata = await sharp(file).metadata()
    const mimeEl = mimeTypes.find(e => e.format === metadata.format)
    if (metadata.format && mimeEl) {
      res.setHeader('Content-type', mimeEl.mime)
    }
    var filestream = fs.createReadStream(file)
    filestream.pipe(res)
  } catch (error) {
    logger.error({ err: error }, 'error serving thumb')
    return res.status(500).json({
      message: 'Error',
      status: 1,
    })
  }
}
