import { model, Schema } from 'mongoose'

export const EnvironmentSchema = new Schema({
  pid: { type: String, required: true },
  id: { type: String, default: '_' },
  items: { type: Schema.Types.Mixed, default: () => ([]) },
})

export const Environment = model('environments', EnvironmentSchema)
