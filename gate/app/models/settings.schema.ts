import { model, Schema } from 'mongoose'

export const SettingSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  name: {
    type: String,
    unique: true,
  },
  display: String,
  type: {
    type: String,
  },
  value: Schema.Types.Mixed,
})

export const Setting = model('settings', SettingSchema)
