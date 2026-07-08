import { Schema, model, Document, Types } from 'mongoose'

import { settings } from '@/settings'



export interface IPhotoMeta {
  originalName: string
  mimeType: string
  fileSize: number
  width: number
  height: number
  density: number
  aspect: number
}

export interface IPhoto extends Document {
  title: string
  description: string
  imagePath: string
  thumbPath: string
  previewPath: string
  tags: Types.ObjectId[]
  collections: Types.ObjectId[]
  meta: IPhotoMeta
  deletedAt: Date
  isDeleted: boolean
}

export const PhotoSchema = new Schema<IPhoto>({
  title: String,
  description: String,
  imagePath: String,
  thumbPath: String,
  previewPath: String,
  tags: [{
    type: Schema.Types.ObjectId,
    ref: 'Tag',
  }],
  collections: [{
    type: Schema.Types.ObjectId,
    ref: 'Collection',
    default: [],
  }],
  meta: {
    originalName: String,
    mimeType: String,
    fileSize: Number,
    width: Number,
    height: Number,
    density: Number,
    aspect: Number,
  },
  deletedAt: Schema.Types.Date,
  isDeleted: Boolean,
}, {
  collection: [
    settings.dbPrefix,
    'Photos',
  ].join('_'),
  timestamps: true,
});

export default model<IPhoto>('Photo', PhotoSchema)
