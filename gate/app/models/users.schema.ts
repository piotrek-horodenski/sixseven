import { model, Schema } from 'mongoose'

export const profileSchema = new Schema({
  display: String,
  type: String,
  status: String,
})

/**
 * Sesja logowania (E — wielotokenowe sesje). Każde urządzenie/logowanie dopisuje
 * własny wpis (login NIE nadpisuje istniejących). Middleware weryfikuje usera po
 * `sessions.token`; logout usuwa TYLKO bieżącą sesję (nie wylogowuje wszystkich
 * urządzeń). `token` (poniżej) trzymany dla zgodności wstecznej.
 */
export const sessionSchema = new Schema(
  {
    token: String,
    createdAt: { type: Number, default: () => Date.now() },
    userAgent: String,
  },
  { _id: false },
)

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
  sessions: { type: [sessionSchema], default: [] },
})

export const User = model('users', UserSchema)
