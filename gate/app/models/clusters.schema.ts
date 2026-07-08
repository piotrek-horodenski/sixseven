import { model, Schema } from 'mongoose'

export const ClusterSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  alias: { type: String, required: true },
  engines: { type: [String], default: [] },
})

export const Cluster = model('clusters', ClusterSchema)
