import { model, Schema } from 'mongoose'

export const StudioPresetSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  cameraIndex: { type: Number, default: 0 },
  name: { type: String, default: '' },
  position: { type: Schema.Types.Mixed, default: () => ({ X: 0, Y: 0, Z: 0 }) },
  rotation: { type: Schema.Types.Mixed, default: () => ({ Pitch: 0, Roll: 0, Yaw: 0 }) },
  aperture: { type: Number, default: 0 },
})

export const StudioPreset = model('studio-presets', StudioPresetSchema)

export const MasksPresetSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  name: { type: String, default: '' },
  masks: { type: Schema.Types.Mixed, default: () => ([]) },
})

export const MasksPreset = model('masks-presets', MasksPresetSchema)
