import { describe, it, expect } from 'vitest'
import { parseSortQuery } from '../../src/controllers/helpers/parse-sort-query'

const defaultSortDirectionByFieldName = [
  { field: 'count', direction: -1 },
  { field: 'name', direction: 1 },
  { field: 'createdAt', direction: -1 },
]

const defaultSort = { count: -1, name: 1 }

describe('parseSortQuery', () => {
  it('returns default sort when no query params', () => {
    const result = parseSortQuery({} as any, defaultSortDirectionByFieldName, defaultSort)
    expect(result).toEqual({ count: -1, name: 1 })
  })

  it('parses single sortBy string into sort object', () => {
    const query = { sortBy: 'name', sortDirection: '1' } as any
    const result = parseSortQuery(query, defaultSortDirectionByFieldName, defaultSort)
    expect(result).toEqual({ name: 1 })
  })

  it('parses array sortBy into sort object', () => {
    const query = { sortBy: ['name', 'count'], sortDirection: ['1', '-1'] } as any
    const result = parseSortQuery(query, defaultSortDirectionByFieldName, defaultSort)
    expect(result).toEqual({ name: 1, count: -1 })
  })

  it('uses default direction from field config when sortDirection not provided', () => {
    const query = { sortBy: 'createdAt' } as any
    const result = parseSortQuery(query, defaultSortDirectionByFieldName, defaultSort)
    expect(result).toEqual({ createdAt: -1 })
  })

  it('handles empty/undefined input gracefully', () => {
    const result = parseSortQuery({ sortBy: undefined } as any, defaultSortDirectionByFieldName, defaultSort)
    expect(result).toEqual({ count: -1, name: 1 })
  })
})
