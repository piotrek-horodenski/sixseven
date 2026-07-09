import { Request, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'

import { settings } from '@/settings'
import Photo from '@/db/models/Photo'
import Tag from '@/db/models/Tag'
import Collection from '@/db/models/Collection'
import { mimeTypes } from '@/consts/mime.const'
import { parseSortQuery } from './helpers/parse-sort-query'
import { escapeRegex } from './helpers/escape-regex'
import { IDefaultSortObject } from '@/models/sort-object.model'
import { IKeyValueObject } from '@/models/key-value-object.model'
import { logger } from '@/logger'

function getNormalSize(width: number, height: number, orientation: number) {
  return orientation >= 5
    ? { width: height, height: width }
    : { width, height };
}

export const defaultPhotoSortDirectionByFieldName: IDefaultSortObject[] = [
  {
    field: 'description',
    direction: 1,
  },
  {
    field: 'title',
    direction: 1,
  },
  {
    field: 'createdAt',
    direction: -1,
  },
  {
    field: 'updatedAt',
    direction: -1,
  },
]
export const defaultPhotoSort: IKeyValueObject = {
  createdAt: -1,
}

export async function getPhotos(req: Request, res: Response): Promise<Response> {
  const defaultPageSize = settings.defaultPageSize || 10
  let page = 0
  let limit = defaultPageSize
  const searchQueryRules: any[] = [
    {
      isDeleted: false,
    }
  ]
  let searchQuery: any = {}

  if (req.query.deleted === '1') {
    if (req.query.active === '0') {
      searchQueryRules[0].isDeleted = true
    } else {
      searchQueryRules.splice(0, 1)
    }
  }

  try {
    if (req.query.phrase) {
      const phrase = decodeURIComponent(String(req.query.phrase))
      if (phrase.length > 200) {
        return res.status(400).json({ message: 'phrase exceeds maximum length of 200 characters' })
      }
      const safePhrase = escapeRegex(phrase)
      searchQueryRules.push({
        $or: [
          {
            title: {
              $regex: '.*' + safePhrase + '.*',
              $options: 'i',
            },
          },
          {
            'meta.originalName': {
              $regex: '.*' + safePhrase + '.*',
              $options: 'i',
            },
          },
        ]
      })
    }

    if (req.query.tag) {
      if (Array.isArray(req.query.tag)) {
        const tags = (req.query.tag as string[])
          .map(tag => decodeURIComponent(tag).trim().toLowerCase())
        
        const tagItems = await Tag.find({
          name: {
            $in: tags,
          },
        })

        if (tagItems.length > 0) {
          let $or: any[] = []
          tagItems.forEach(tagItem => {
            $or.push({
              tags: tagItem._id,
            })
          })
          searchQueryRules.push({
            $or,
          })
        }
      } else {
        const tag = (req.query.tag as string)
          .trim()
          .toLowerCase()

        const tagItem = await Tag.findOne({
          name: tag,
        })
        
        if (tagItem) {
          searchQueryRules.push({
            tags: tagItem._id,
          })
        }
      }
    }

    if (req.query.collection) {
      if (Array.isArray(req.query.collection)) {
        let collectionRules: any = []
        const collections = (req.query.collection as string[])
          .map(col => decodeURIComponent(col).trim())
        
        const collectionItems = await Collection.find({
          name: {
            $in: collections,
          },
        })

        if (collectionItems.length > 0) {
          collectionItems.forEach(collectionItem => {
            collectionRules.push({
              collections: collectionItem._id,
            })
          })
        }

        if (collectionRules.length > 0) {
          searchQueryRules.push({
            $or: collectionRules,
          })
        }
      } else {
        const collection = decodeURIComponent(req.query.collection as string)
          .trim()

        const collectionItem = await Collection.findOne({
          name: collection,
        })
        
        if (collectionItem) {
          searchQueryRules.push({
            collections: collectionItem._id,
          })
        }
      }
    }

    if (searchQueryRules.length > 1) {
      searchQuery = {
        $and: searchQueryRules,
      }
    } else if (searchQueryRules.length === 1) {
      searchQuery = searchQueryRules[0]
    }
  } catch (error) {
    logger.error({ err: error }, 'error building search query')
    return res.status(500).json({
      message: 'Error while creating search query',
      status: 2,
    })
  }
  
  const MAX_PAGE_SIZE = 200
  if (req.query.page) {
    const parsedPage = Number(req.query.page)
    if (!Number.isInteger(parsedPage) || parsedPage < 0) {
      return res.status(400).json({ message: 'page must be a non-negative integer' })
    }
    page = parsedPage
  }
  if (req.query.limit) {
    const parsedLimit = Number(req.query.limit)
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ message: 'limit must be a non-negative integer' })
    }
    limit = Math.min(parsedLimit, MAX_PAGE_SIZE)
  }

  const skip = Number(page || 0) * defaultPageSize
  let sort = parseSortQuery(
    req.query,
    defaultPhotoSortDirectionByFieldName,
    defaultPhotoSort,
  )

  if (sort.hasOwnProperty('title')) {
    sort.createdAt = -1
  }

  try {
    const photos = await Photo
      .find(searchQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('tags', {
        _id: 0,
        name: 1,
        count: 1,
      })
      .populate('collections', {
        _id: 0,
        name: 1,
        count: 1,
      })

    return res.json({
      images: photos.map(photo => {
        return {
          _id: photo._id,
          title: photo.title,
          description: photo.description,
          tags: photo.tags,
          meta: photo.meta,
          collections: photo.collections,
          isDeleted: req.query.deleted === '1' ? photo.isDeleted : undefined,
        }
      }),
      metadata: {
        pageSize: limit,
        page: Number(page || 0),
        prefix: {
          images: 'photos/',
          thumbs: 'thumbs/',
        },
      },
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error fetching photos')
    return res.status(500).json({
      message: 'Error while fetching photos',
      status: 1,
    })
  }
}

export async function createPhoto(req: Request, res: Response): Promise<Response> {
  // Extract the required data from the request body
  const {
    title,
    description,
    tags,
    collections,
  } = req.body

  // Check if a file is attached to the request
  if (!req.file) {
    return res.status(400).json({
      message: 'Photo Not Sent',
      status: 2,
    })
  }

  // Check if at least one tag is provided
  if (
    !req.body.tags ||
    !req.body.tags
      .split(' ')
      .filter((tag: string) => tag.trim().length > 0)
      .length
  ) {
    return res.status(400).json({
      message: 'Photo need at least one tag',
      status: 3,
    })
  }

  try {
    const now = new Date();
    const iso = now.toISOString()
    const today = iso.substring(0, iso.indexOf('T'))
    const dir = path.join(settings.uploads, 'thumbs', today)

    // Ensure the uploads directory exists
    await fs.ensureDir(dir)

    const orig = sharp(req.file.path, { failOnError: false })
    const origMeta = await orig.metadata()
    if (
      origMeta && origMeta.width &&
      origMeta.height && origMeta.orientation
    ) {
      const normalized = getNormalSize(
        origMeta.width,
        origMeta.height,
        origMeta.orientation
      )

      origMeta.width = normalized.width
      origMeta.height = normalized.height
    }

    // Create a thumbnail for the uploaded photo
    const thumbPath = path.join(dir, [
      path.parse(req.file.path).name,
      settings.thumbExtension,
    ].join('.'))
    const previewPath = path.join(dir, [
      path.parse(req.file.path).name + '_preview',
      settings.previewExtension,
    ].join('.'))

    await sharp(req.file.path, { failOnError: false })
      .resize(
        settings.thumbWidth,
        settings.thumbHeight,
        {
          fit: 'cover',
        }
      )
      .withMetadata()
      .toFormat(settings.thumbExtension, {
        quality: 100,
      })
      .toFile(thumbPath)
    await sharp(req.file.path, { failOnError: false })
      .resize(
        settings.previewWidth,
        settings.previewHeight,
        {
          fit: 'inside',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        }
      )
      .withMetadata()
      .toFormat(settings.previewExtension)
      .toFile(previewPath)

    // Find existing tags in the database
    const tagNames: string[] = tags
      .split(' ')
      .filter((name: string) => name.trim().length > 0)
      .map((name: string) => name.trim().toLowerCase())
    const tagItems = await Tag.find({
      name: {
        $in: tagNames
      },
    })

    // Find tags that do not exist in the database
    const notExistingTags = tagNames
      .filter(name => !tagItems.some(tag => tag.name === name))

    let tagsIds = tagItems.map(tag => tag._id)

    // Update the count of existing tags
    if (tagItems.length > 0) {
      await Tag.updateMany({
        _id: {
          $in: tagItems.map(tag => tag._id),
        },
      },
      {
        $inc: {
          count: 1,
        },
      })
    }

    // Create new tags if they do not exist
    if (notExistingTags.length > 0) {
      const insertResponse = await Tag.insertMany(
        notExistingTags
          .map(name => ({
            name,
            count: 1,
          }))
      )
      tagsIds = tagsIds.concat(insertResponse.map(tag => tag._id))
    }

    // Find existing collections in the database
    const collectionNames: string[] = Array.isArray(collections) ? collections : !!collections ? [collections] : []
    const collectionItems = await Collection.find({
      name: {
        $in: collectionNames
      },
    })

    // Update the count of existing collections
    if (collectionItems.length > 0) {
      await Collection.updateMany({
        _id: {
          $in: collectionItems.map(col => col._id),
        },
      },
      {
        $inc: {
          count: 1,
        },
      })
    }

    // Find collections that do not exist in the database
    const notExistingCollections = collectionNames
      .filter(name => !collectionItems.some(col => col.name === name))

    let collectionIds = collectionItems.map(col => col._id)

    // Create new collections if they do not exist
    if (notExistingCollections.length > 0) {
      const insertResponse = await Collection.insertMany(
        notExistingCollections
          .map(name => ({
            name,
            count: 1,
          }))
      )
      collectionIds = collectionIds.concat(insertResponse.map(col => col._id))
    }

    // Create a new photo document
    const newPhoto = {
      title,
      description,
      imagePath: req.file.path,
      thumbPath,
      previewPath,
      tags: tagsIds,
      collections: collectionIds,
      meta: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        width: origMeta.width,
        height: origMeta.height,
        density: origMeta.density,
        aspect: (origMeta.width || 1) / (origMeta.height || 1),
      },
      deletedAt: null,
      isDeleted: false,
    }
    const photo = new Photo(newPhoto)

    // Save the photo to the database
    await photo.save()

    return res.json({
      message: 'Photo Saved Successfully',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error saving photo')
    return res.status(500).json({
      message: 'Error while saving photo',
      status: 1,
    })
  }
}

export async function getPhoto(req: Request, res: Response): Promise<any> {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({
      message: 'No Photo id provided',
      status: 2
    })
  }
  try {
    const photo = await Photo.findById(id)
    if (!photo) {
      return res.json({
        message: 'Photo Not Found',
        status: 3,
      })
    }
    const file = photo.imagePath
    res.setHeader('Content-disposition', 'filename*=UTF-8\'\'' + encodeURIComponent(photo.title))
    const metadata = await sharp(file, { failOnError: false }).metadata()
    const mimeEl = mimeTypes.find(e => e.format === metadata.format)
    if (metadata.format && mimeEl) {
      res.setHeader('Content-type', mimeEl.mime)
    }
    var filestream = fs.createReadStream(file)
    filestream.pipe(res)
  } catch (error) {
    logger.error({ err: error }, 'error finding photo by id')
    return res.status(500).json({
      message: 'Error while finding photo',
      status: 1,
    })
  }
}

export async function getPhotoMeta(req: Request, res: Response): Promise<any> {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({
      message: 'No Photo id provided',
      status: 2,
    })
  }
  try {
    const photo = await Photo
      .findById(id, {
        title: 1,
        description: 1,
        tags: 1,
      })
      .populate('tags', {
        _id: 0,
        name: 1,
        count: 1,
      })
      .populate('collections', {
        _id: 0,
        name: 1,
      })

    if (!photo) {
      return res.json({
        message: 'Photo Not Found',
        status: 3,
      })
    }

    return res.json({
      _id: photo._id,
      title: photo.title,
      description: photo.description,
      tags: photo.tags,
      collections: photo.collections,
      isDeleted: photo.isDeleted,
    })
  } catch (error) {
    logger.error({ err: error }, 'error finding photo meta')
    return res.status(500).json({
      message: 'Error while finding photo meta',
      status: 1,
    })
  }
}

export async function deletePhoto(req: Request, res: Response): Promise<Response> {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({
      message: 'No Photo id provided',
      status: 2
    })
  }

  try {
    if (req.query.force === '1') {
      const photo = await Photo.findById(id)
      if (!photo) {
        return res.json({
          message: 'Photo Not Found',
          status: 3
        })
      }
      // unlinking tags
      await Tag.updateMany({ _id: { $in: photo.tags } }, {
        $inc: {
          count: -1,
        },
      })
      // unlinking collections
      await Collection.updateMany({ _id: { $in: photo.collections } }, {
        $inc: {
          count: -1,
        },
      })
      if (photo.isDeleted) {
        await fs.promises.unlink(photo.imagePath)
        await fs.promises.unlink(photo.thumbPath)
        await fs.promises.unlink(photo.previewPath)

        await Photo.deleteOne({ _id: id })
      }
    } else {
      const photo = await Photo.findOneAndUpdate({ _id: id }, {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      })
    }
  } catch (error) {
    return res.status(404).json({
      message: 'Photo Not Found',
      status: 4
    })
  }

  return res.json({
    message: 'Photo Deleted',
    status: 0,
  })
}

export async function updatePhoto(req: Request, res: Response): Promise<Response> {
  const { id } = req.params
  let $set: any = {}

  const photoOriginal = await Photo
    .findById(id)
    .populate('tags', {
      _id: 1,
      name: 1,
      count: 1,
    })

  if (!photoOriginal) {
    return res.status(404).json({
      message: 'Photo Not Found',
      status: 2,
    })
  }

  if (req.body.title) {
    $set.title = req.body.title
  }
  
  if (req.body.description) {
    $set.description = req.body.description
  }

  if (req.body.tags) {
    if (!req.body.tags.length) {
      return res.status(400).json({
        message: 'Photo need at least one tag',
        status: 3,
      })
    }
    try {
      const tagNames: string[] = req.body.tags
        .split(' ')
        .filter((name: string) => name.trim().length > 0)
        .map((name: string) => name.trim().toLowerCase())
      const tagItems = await Tag.find({
        name: {
          $in: tagNames
        },
      })
      let tagsIds = tagItems.map(tag => tag._id)
      const oldExistingTags = tagItems
        .filter(tag => (photoOriginal.tags as any[])
          .some(t => t._id.equals(tag._id))
        )
      const oldNotExistingTags = (photoOriginal.tags as any[])
        .filter(tag => !tagItems
          .some(t => t._id.equals(tag._id))
        )
      const newExistingTags = tagItems
        .filter(tag => !oldExistingTags.some(t => t._id.equals(tag._id)))
      const notExistingTags = tagNames
        .filter(name => !tagItems.some(tag => tag.name === name))

      if (newExistingTags.length > 0) {
        await Tag.updateMany({
          _id: {
            $in: newExistingTags.map(tag => tag._id),
          },
        },
        {
          $inc: {
            count: 1,
          },
        })
      }
      if (oldNotExistingTags.length > 0) {
        await Tag.updateMany({
          _id: {
            $in: oldNotExistingTags.map(tag => tag._id),
          },
        },
        {
          $inc: {
            count: -1,
          },
        })
      }
      if (notExistingTags.length > 0) {
        const insertResponse = await Tag.insertMany(
          notExistingTags
            .map(name => ({
              name,
              count: 1,
            }))
        )
        tagsIds = tagsIds.concat(insertResponse.map(tag => tag._id))
      }

      $set.tags = tagsIds
    } catch (error) {
      logger.error({ err: error }, 'error updating photo tags')
      return res.status(500).json({
        message: 'Error while updating photo tags. Unable to update photo',
        status: 4,
      })
    }
  }
  if (req.body.collections) {
    try {
      const collectionNames: string[] = Array.isArray(req.body.collections) ? req.body.collections : [req.body.collections]
        .filter((name: string) => name.trim().length > 0)
      const collectionItems = await Collection.find({
        name: {
          $in: collectionNames
        },
      })
      let collectionsIds = collectionItems.map(col => col._id)
      const notExistingCollections = collectionNames
        .filter(name => !collectionItems.some(col => col.name === name))
      const oldNotExistingCollections = (photoOriginal.collections as any[])
        .filter(col => !collectionItems
          .some(c => c._id.equals(col._id))
        )
      const newExistingCollections = collectionItems
        .filter(col => !oldNotExistingCollections
          .some(c => c._id.equals(col._id))
        )
      
      if (newExistingCollections.length > 0) {
        await Collection.updateMany({
          _id: {
            $in: newExistingCollections
              .map(col => col._id),
          },
        }, {
          $inc: {
            count: 1,
          },
        })
      }

      if (notExistingCollections.length > 0) {
        const insertResponse = await Collection.insertMany(
          notExistingCollections
            .map(name => ({
              name,
              count: 1,
            }))
        )
        collectionsIds = collectionsIds
          .concat(insertResponse.map(col => col._id))
      }
      if (oldNotExistingCollections.length > 0) {
        await Collection.updateMany({
          _id: {
            $in: oldNotExistingCollections
              .map(col => col._id),
          },
        }, {
          $inc: {
            count: -1,
          },
        })
      }

      $set.collections = collectionsIds
    } catch (error) {
      logger.error({ err: error }, 'error updating photo collections')
      return res.status(500).json({
        message: 'Error while updating photo collection. Unable to update photo',
        status: 5,
      })
    }
  }

  if (req.body.isDeleted !== undefined) {
    $set.isDeleted = req.body.isDeleted
  }
  try {
    const photo = await Photo.findByIdAndUpdate(id, $set)

    if (!photo) {
      return res.json({
        message: 'Photo Not Found',
        status: 6,
      })
    }

    return res.json({
      message: 'Successfully updated',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error updating photo')
    return res.status(500).json({
      message: 'Error while updating photo',
      status: 1,
    })
  }
}

export async function batchUpdatePhotos(req: Request, res: Response): Promise<Response> {
  const ids: string[] = req.body.ids
  const tagsToAdd: any[] = req.body.tagsToAdd
  const tagsToRemove: any[] = req.body.tagsToRemove
  const collectionsToAdd: any[] = req.body.collectionsToAdd
  const collectionsToRemove: any[] = req.body.collectionsToRemove

  let photos: any[] = []
  let existingTags: any[] = []
  let existingCollections: any[] = []
  try {
    photos = await Photo.find({
      _id: {
        $in: ids,
      },
    })
    photos = photos.map(photo => photo.toJSON())
    existingTags = await Tag.find({
      name: {
        $in: [...tagsToAdd, ...tagsToRemove].map(tag => tag.name),
      }
    })
    existingTags = existingTags.map(tag => tag.toJSON())
    existingCollections = await Collection.find({
      name: {
        $in: [...collectionsToAdd, ...collectionsToRemove].map(col => col.name),
      }
    })
    existingCollections = existingCollections.map(col => col.toJSON())
  } catch (error) {
    return res.status(500).json({
      message: 'Problem with updating photos',
      status: 1,
    })
  }

  if (!photos.length) {
    return res.status(500).json({
      message: 'Problem with updating photos',
      status: 2,
    })
  }

  let newTags = tagsToAdd
    .filter(tag => !existingTags.some(t => t.name === tag.name))
  let newCollections = collectionsToAdd
    .filter(col => !existingCollections.some(c => c.name === col.name))

  if (newTags.length > 0) {
    try {
      const insertResponse = await Tag.insertMany(
        newTags
          .map(tag => ({
            name: tag.name,
            count: 0,
          }))
      )
      newTags = insertResponse.map(tag => tag.toJSON())
    } catch (error) {
      return res.json({
        message: 'Problem with updating photos',
        status: 3,
      })
    }
  }
  
  if (newCollections.length > 0) {
    try {
      const insertResponse = await Collection.insertMany(
        newCollections
          .map(col => ({
            name: col.name,
            count: 0,
          }))
      )
      newCollections = insertResponse.map(col => col.toJSON())
    } catch (error) {
      return res.json({
        message: 'Problem with updating photos',
        status: 3,
      })
    }
  }
  
  const allTagsToRemove = tagsToRemove
    .filter(tag => !!existingTags.some(t => t.name === tag.name))
    .map(tag => ({
      ...tag,
      newCount: tag.count,
    }))
  const allCollectionsToRemove = collectionsToRemove
    .filter(col => !!existingCollections.some(c => c.name === col.name))
    .map(col => ({
      ...col,
      newCount: col.count,
    }))
  const allTagsToAdd = [
    ...existingTags
      .filter(tag => !allTagsToRemove.some(t => t.name === tag.name)),
    ...newTags,
  ].map(tag => ({
    ...tag,
    newCount: tag.count,
  }))
  const allCollectionsToAdd = [
    ...existingCollections
      .filter(col => !allCollectionsToRemove.some(c => c.name === col.name)),
    ...newCollections,
  ].map(col => ({
    ...col,
    newCount: col.count,
  }))

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const originalTags = [...photo.tags]
    const originalCollections = [...photo.collections]

    let $set: any = {}
    if (allTagsToAdd.length > 0 || allTagsToRemove.length > 0) {
      const newTags = allTagsToAdd
        .filter(tag => !photo.tags.some((t: any) => t.equals(tag._id)))

      $set.tags = [
        ...photo.tags
          .filter((tagId: any) => !allTagsToRemove.some(t => tagId.equals(t._id))),
        ...newTags.map(tag => tag._id),
      ]
    }
    if (allCollectionsToAdd.length > 0 || allCollectionsToRemove.length > 0) {
      const newCollections = allCollectionsToAdd
        .filter(col => !photo.collections.some((c: any) => c.equals(col._id)))

      $set.collections = [
        ...photo.collections
          .filter((colId: any) => !allCollectionsToRemove.some(c => colId.equals(c._id))),
        ...newCollections.map(col => col._id),
      ]
    }

    allTagsToAdd.forEach(tag => {
      if (!originalTags.some(t => t.equals(tag._id))) {
        tag.newCount++
      }
    })
    allCollectionsToAdd.forEach(col => {
      if (!originalCollections.some(c => c.equals(col._id))) {
        col.newCount++
      }
    })
    allTagsToRemove.forEach(tag => {
      if (originalTags.some(t => t.equals(tag._id))) {
        tag.newCount--
      }
    })
    allCollectionsToRemove.forEach(col => {
      if (originalCollections.some(c => c.equals(col._id))) {
        col.newCount--
      }
    })

    let p = null

    try {
      p = await Photo.findByIdAndUpdate(photo._id, $set)
    } catch (error) {
      photo.status = 1
    }
  }

  const allTags = [...allTagsToAdd, ...allTagsToRemove] as any[]
  const allCollections = [...allCollectionsToAdd, ...allCollectionsToRemove] as any[]

  await Promise.all(
    allTags
      .filter(tag => tag.newCount !== tag.count)
      .map(async tag => {
        try {
          await Tag.findByIdAndUpdate(tag._id, {
            count: tag.newCount,
          })
        } catch (error) {
          logger.error({ error, tagId: tag._id }, 'failed to update tag count')
        }
      })
  )

  await Promise.all(
    allCollections
      .filter(col => col.newCount !== col.count)
      .map(async col => {
        try {
          await Collection.findByIdAndUpdate(col._id, {
            count: col.newCount,
          })
        } catch (error) {
          logger.error({ error, collectionId: col._id }, 'failed to update collection count')
        }
      })
  )

  return res.json({
    message: 'Successfully updated',
    status: 0,
  })
}
