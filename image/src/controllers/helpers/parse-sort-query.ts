import { Query } from 'express-serve-static-core'

import { IKeyValueObject } from '@/models/key-value-object.model'
import { IDefaultSortObject } from '@/models/sort-object.model'

export const parseSortQuery = (
  query: Query,
  defaultSortDirectionByFieldName: IDefaultSortObject[],
  defaultSort: IKeyValueObject
) => {
  let sortBy: string[] = []
  let sortDirection: number[] = []

  if (
    query.sortBy &&
    !Array.isArray(query.sortBy)
  ) {
    sortBy = [query.sortBy as string]
  } else if (
    query.sortBy &&
    Array.isArray(query.sortBy)
  ) {
    sortBy = query.sortBy as string[]
  }

  if (
    query.sortDirection &&
    !Array.isArray(query.sortDirection)
  ) {
    sortDirection = [Number(query.sortDirection)]
  } else if (
    query.sortDirection &&
    Array.isArray(query.sortDirection)
  ) {
    sortDirection = (query.sortDirection as string[])
      .map(s => Number(s))
  }

  let sort: IKeyValueObject = {
    ...defaultSort,
  }

  if (sortBy.length) {
    sort = {}
    sortBy.forEach((s: string, index) => {
      const defaultItem = defaultSortDirectionByFieldName
        .find(item => item.field === s)
      let dir = 1
      if (sortDirection.length && index < sortDirection.length) {
        dir = Number(sortDirection[index])
      } else if (defaultItem) {
        dir = defaultItem.direction
      }

      sort[s] = dir
    })
  }

  return sort
}
