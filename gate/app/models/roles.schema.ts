import { model, Schema } from 'mongoose'

export const RoleSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  name: String,
  display: String,
  permissions: [String],
  useRoles: [String],
})

export const Role = model('roles', RoleSchema)
