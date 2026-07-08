import { model, Schema } from 'mongoose'

export const ProjectSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  name: { type: String, required: true },
  displayName: { type: String, default: '' },
  map: { type: String, default: '' },
  source: { type: String, default: '' },
  type: { type: String, enum: ['standalone', 'cluster'], default: 'standalone' },
  env: { type: String, default: '' },
  devEngine: { type: String, default: '' },
  concept: { type: String, default: '' },
  cameras: { type: [String], default: [] },
  productionReady: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  useStandalone: { type: Boolean, default: true },
  useBatch: { type: Boolean, default: false },
  globalAdjustments: { type: Schema.Types.Mixed, default: () => ({}) },
  virtualSet: { type: Schema.Types.Mixed, default: () => ({}) },
})

export const Project = model('projects', ProjectSchema)
