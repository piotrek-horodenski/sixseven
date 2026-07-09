import { Request, Response } from 'express'

import { settings } from '@/settings'
import Photo from '@/db/models/Photo'
import Collection from '@/db/models/Collection'
import { parseSortQuery } from './helpers/parse-sort-query'
import { IDefaultSortObject } from '@/models/sort-object.model'
import { IKeyValueObject } from '@/models/key-value-object.model'
import { logger } from '@/logger'



export const defaultCollectionSortDirectionByFieldName: IDefaultSortObject[] = [
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
export const defaultCollectionSort: IKeyValueObject = {
  name: 1,
}

export async function getCollections(req: Request, res: Response): Promise<Response> {
  const defaultPageSize = settings.defaultPageSize || 10
  let page = 0
  let limit = defaultPageSize
  let searchQuery: any = {}

  if (req.query.phrase) {
    searchQuery = {
      name: {
        $regex: '.*' + decodeURIComponent(String(req.query.phrase)) + '.*'
      }
    }
  }
  if (req.query.page) {
    page = Number(req.query.page)
  }
  if (req.query.limit) {
    limit = Number(req.query.limit)
  }

  const skip = Number(page || 0) * defaultPageSize
  const sort = parseSortQuery(
    req.query,
    defaultCollectionSortDirectionByFieldName,
    defaultCollectionSort,
  )

  try {
    if (req.query.full) {
      const collections = await Collection
        .find(searchQuery)
        .sort(sort)

      return res.json({
        collections: collections.map(collection => ({
          name: collection.name,
          count: collection.count,
        })),
        metadata: {
          pageSize: collections.length,
          page: -1,
        },
        status: 0,
      })
    } else {
      const collections = await Collection
        .find(searchQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)

      return res.json({
        collections,
        metadata: {
          pageSize: limit,
          page: Number(page || 0),
        },
        status: 0,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error fetching collections')
    return res.status(500).json({
      message: 'Error while fetching collections',
      status: 1,
    })
  }
}

export async function addCollection(req: Request, res: Response): Promise<Response> {
  // todo
  let newCollection: any = {}

  if (!req.body.name) {
    return res.status(400).json({
      message: 'Collection name is required',
      status: 2,
    })
  }

  try {
    if (await Collection.findOne({ name: req.body.name })) {
      return res.status(409).json({
        message: 'Collection already exists',
        status: 3,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error checking collection existence')
    return res.status(500).json({
      message: 'Error while checking collection for existence',
      status: 4,
    })
  }

  newCollection.name = req.body.name.toLowerCase()
  newCollection.count = 0

  const collection = new Collection(newCollection)

  try {
    await collection.save()

    return res.json({
      message: 'Collection Saved Successfully',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error saving collection')
    return res.status(500).json({
      message: 'Error while saving collection',
      status: 1,
    })
  }
}

export async function removeCollection(req: Request, res: Response): Promise<Response> {
  const { id } = req.params
  let collection

  try {
    collection = await Collection.findById(id)

    if (!collection) {
      return res.status(404).json({
        message: 'Collection does not exist',
        status: 2,
      })
    }

    const photos = await Photo.find({
      collections: collection._id,
    })

    if (photos.length > 0) {
      return res.status(409).json({
        message: 'Collection can not be deleted, it is being used',
        status: 3,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'error checking collection existence')
    return res.status(500).json({
      message: 'Error while checking collection for existence',
      status: 4,
    })
  }

  try {
    await Collection.deleteOne({ _id: collection._id })

    return res.json({
      message: 'Collection Deleted Successfully',
      status: 0,
    })
  } catch (error) {
    logger.error({ err: error }, 'error deleting collection')
    return res.status(500).json({
      message: 'Error while deleting collection',
      status: 1,
    })
  }
}
