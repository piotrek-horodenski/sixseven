import { useGateStore } from '@/stores/gate/gate.store'
import type { IImageFilters, IImagesResponse, IImageTag, IImageCollection } from './images.model'

const baseUrl = import.meta.env.VITE_IMAGE_URL || 'http://localhost:5179/api'

function authHeaders(): Record<string, string> {
  const gate = useGateStore()
  const headers: Record<string, string> = {}
  if (gate.authToken) {
    headers['Authorization'] = `Bearer ${gate.authToken}`
  }
  return headers
}

function jsonAuthHeaders(): Record<string, string> {
  return {
    ...authHeaders(),
    'Content-Type': 'application/json',
  }
}

function buildPhotosQuery(filters: Partial<IImageFilters>): string {
  const params = new URLSearchParams()

  if (filters.phrase) params.set('phrase', filters.phrase)
  if (filters.sortBy) params.set('sortBy', filters.sortBy)
  if (filters.sortDirection !== undefined) params.set('sortDirection', String(filters.sortDirection))
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.deleted) params.set('deleted', '1')
  if (!filters.active && filters.deleted) params.set('active', '0')

  if (filters.tags?.length) {
    filters.tags.forEach(tag => params.append('tag', tag))
  }
  if (filters.collection) {
    params.set('collection', filters.collection)
  }

  return params.toString()
}

export async function fetchImages(filters: Partial<IImageFilters>): Promise<IImagesResponse> {
  const query = buildPhotosQuery(filters)
  const res = await fetch(`${baseUrl}/photos?${query}`)
  if (!res.ok) throw new Error('Failed to fetch images')
  return res.json()
}

export async function uploadImage(
  file: File,
  metadata: { title: string; description: string; tags: string; collections: string[] },
): Promise<void> {
  const form = new FormData()
  form.append('image', file)
  form.append('title', metadata.title)
  form.append('description', metadata.description)
  form.append('tags', metadata.tags)
  metadata.collections.forEach(col => form.append('collections', col))

  const res = await fetch(`${baseUrl}/photos`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || 'Failed to upload image')
  }
}

export async function updateImage(
  id: string,
  data: { title?: string; description?: string; tags?: string; collections?: string[]; isDeleted?: boolean },
): Promise<void> {
  const res = await fetch(`${baseUrl}/photos/${id}`, {
    method: 'PUT',
    headers: jsonAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update image')
}

export async function deleteImage(id: string, force = false): Promise<void> {
  const query = force ? '?force=1' : ''
  const res = await fetch(`${baseUrl}/photos/${id}${query}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete image')
}

export async function batchUpdateImages(payload: {
  ids: string[]
  tagsToAdd: { name: string }[]
  tagsToRemove: { name: string }[]
  collectionsToAdd: { name: string }[]
  collectionsToRemove: { name: string }[]
}): Promise<void> {
  const res = await fetch(`${baseUrl}/photos/batch/update`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to batch update images')
}

export async function fetchTags(): Promise<IImageTag[]> {
  const res = await fetch(`${baseUrl}/tags`)
  if (!res.ok) throw new Error('Failed to fetch tags')
  const data = await res.json()
  return data.tags ?? data
}

export async function createTag(name: string): Promise<void> {
  const res = await fetch(`${baseUrl}/tags`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create tag')
}

export async function deleteTag(id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/tags/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete tag')
}

export async function fetchCollections(): Promise<IImageCollection[]> {
  const res = await fetch(`${baseUrl}/collections`)
  if (!res.ok) throw new Error('Failed to fetch collections')
  const data = await res.json()
  return data.collections ?? data
}

export async function createCollection(name: string): Promise<void> {
  const res = await fetch(`${baseUrl}/collections`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create collection')
}

export async function deleteCollection(id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/collections/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete collection')
}

export function getThumbUrl(id: string): string {
  return `${baseUrl}/thumbs/${id}`
}

export function getPreviewUrl(id: string): string {
  return `${baseUrl}/thumbs/${id}?preview=1`
}

export function getImageUrl(id: string): string {
  return `${baseUrl}/photos/${id}`
}
