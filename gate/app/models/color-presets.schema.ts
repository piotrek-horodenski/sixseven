import { model, Schema } from 'mongoose'

export const ColorPresetSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  hex: { type: String, required: true, unique: true, lowercase: true },
})

export const ColorPreset = model('color-presets', ColorPresetSchema)
