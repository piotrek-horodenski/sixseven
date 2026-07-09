export interface IImageMeta {
  originalName: string
  mimeType: string
  fileSize: number
  width: number
  height: number
  density: number
  aspect: number
}

export interface IImageTag {
  _id?: string
  name: string
  count: number
}

export interface IImageCollection {
  _id?: string
  name: string
  count?: number
}

export interface IImage {
  _id: string
  title: string
  description: string
  tags: IImageTag[]
  collections: IImageCollection[]
  meta: IImageMeta
  isDeleted?: boolean
}

export interface IImagesMetadata {
  pageSize: number
  page: number
  prefix: {
    images: string
    thumbs: string
  }
}

export interface IImagesResponse {
  images: IImage[]
  metadata: IImagesMetadata
  status: number
}

export interface IImageFilters {
  phrase: string
  tags: string[]
  collection: string
  sortBy: string
  sortDirection: number
  page: number
  limit: number
  deleted: boolean
  active: boolean
}

export type ViewMode = 'grid' | 'list'
