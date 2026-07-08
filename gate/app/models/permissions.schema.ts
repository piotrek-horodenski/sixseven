import { model, Schema } from 'mongoose'

export const PermissionSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  name: String,
  display: String,
  group: String,
})

export const Permission = model('permissions', PermissionSchema)
