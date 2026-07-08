import { model, Schema } from 'mongoose'

export const EngineSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  alias: { type: String, required: true },
  address: { type: String, required: true },
  port: { type: Number, default: 30011 },
  rePort: { type: Number, default: 30010 },
  cameraNumber: { type: Number, default: 0 },
  status: { type: Number, default: 0 },
  since: { type: Number, default: () => Date.now() },
  lastAttempt: { type: Number, default: -1 },
  assignedProject: { type: String, default: '' },
  assignedProjectId: { type: String, default: '' },
  initialized: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
})

export const Engine = model('engines', EngineSchema)
