import { model, Schema } from 'mongoose'

export const profileSchema = new Schema({
  display: String,
  type: String,
  status: String,
})

export const UserSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  password: String,
  profile: profileSchema,
  roles: [String],
  permissions: [String],
  allRoles: [String],
  token: String,
})

export const User = model('users', UserSchema)
