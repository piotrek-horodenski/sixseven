import { Request, Response } from 'express'

import { settings } from '@/settings'
import Photo from '@/db/models/Photo'
import Tag from '@/db/models/Tag'
import { parseSortQuery } from './helpers/parse-sort-query'
import { escapeRegex } from './helpers/escape-regex'
import { IDefaultSortObject } from '@/models/sort-object.model'
import { IKeyValueObject } from '@/models/key-value-object.model'
import { logger } from '@/logger'



export const defaultTagSortDirectionByFieldName: IDefaultSortObject[] = [
  {
    field: 'count',
    direction: -1,
  },
  {
    field: 'name',
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
export const defaultTagSort: IKeyValueObject = {
  count: -1,
  name: 1,
}

export async function getTags(req: Request, res: Response): Promise<Response> {
  const defaultPageSize = settings.defaultPageSize || 10
  let page = 0
  let limit = defaultPageSize
  let searchQuery: any = {}

  if (req.query.phrase) {
    const phrase = String(req.query.phrase)
    if (phrase.length > 200) {
      return res.status(400).json({ message: 'phrase exceeds maximum length of 200 characters' })
    }
    searchQuery = {
      name: {
        $regex: '.*' + escapeRegex(phrase) + '.*'
      }
    }
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
  const sort = parseSortQuery(
    req.query,
    defaultTagSortDirectionByFieldName,
    defaultTagSort,
  )

  try {
    if (req.query.full) {
      const tags = await Tag
        .find(searchQuery)
        .sort(sort)

      return res.json({
        tags,
        metadata: {
          pageSize: tags.length,
          page: -1,
        },
        status: 0,
      })
    } else {
      const tags = await Tag
        .find(searchQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)

      return res.json({
        tags: tags.map(tag => {
          let createdAt = undefined

          if (req.query.createdAt === '1') {
            createdAt = tag.createdAt
          }
          return {
            _id: tag._id,
            name: tag.name,
            count: tag.count,
            createdAt,
          }
        }),
        metadata: {
          pageSize: limit,
          page: Number(page || 0),
        },
        status: 0,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error fetching tags')

    return res.status(500).json({
      message: 'Error while fetching tags',
      status: 1,
    })
  }
}

export async function addTag(req: Request, res: Response): Promise<Response> {
  // todo
  let newTag: any = {}

  if (!req.body.name) {
    return res.status(400).json({
      message: 'name is required',
      status: 2,
    })
  }

  try {
    if (await Tag.findOne({ name: req.body.name })) {
      return res.status(409).json({
        message: 'Tag already exists',
        status: 3,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error checking tag existence')
    return res.status(500).json({
      message: 'Error while checking tag for existence',
      status: 4,
    })
  }

  newTag.name = req.body.name.toLowerCase()
  newTag.count = 0

  const tag = new Tag(newTag)

  try {
    await tag.save()

    return res.json({
      message: 'Tag Saved Successfully',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error saving tag')
    return res.status(500).json({
      message: 'Error while saving tag',
      status: 1,
    })
  }
}

export async function removeTag(req: Request, res: Response): Promise<Response> {
  const { id } = req.params
  let tag

  try {
    tag = await Tag.findById(id)
    if (!tag) {
      return res.status(404).json({
        message: 'Tag does not exist',
        status: 2,
      })
    }

    const photos = await Photo.find({
      tags: tag._id,
    })

    if (photos.length > 0) {
      return res.status(409).json({
        message: 'Tag can not be deleted, it is being used',
        status: 3,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error checking tag existence')
    return res.status(500).json({
      message: 'Error while checking tag for existence',
      status: 4,
    })
  }

  try {
    await Tag.deleteOne({ _id: tag._id })

    return res.json({
      message: 'Tag Deleted Successfully',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error deleting tag')
    return res.status(500).json({
      message: 'Error while deleting tag',
      status: 1,
    })
  }
}
