import { model, Schema } from 'mongoose'

export const DatasetSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  datasetId: { type: String, required: true },
  versionId: { type: String, default: '' },
  currentVersionId: { type: String, default: '' },
  parseOptions: { type: Schema.Types.Mixed, default: () => ({}) },
})

export const Dataset = model('datasets', DatasetSchema)

export const DatasetVersionSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  datasetId: { type: String, required: true },
  versionId: { type: String, required: true },
  stats: { type: Schema.Types.Mixed, default: () => ({}) },
  changed: { type: Number, default: () => Date.now() },
})

export const DatasetVersion = model('dataset-versions', DatasetVersionSchema)

export const DatasetItemSchema = new Schema({
  pid: { type: String, required: true },
  datasetId: { type: String, required: true },
  versionId: { type: String, required: true },
  category: { type: String, default: '' },
  originalName: { type: String, default: '' },
  options: { type: Schema.Types.Mixed, default: () => ([]) },
})

export const DatasetItem = model('dataset-items', DatasetItemSchema)
