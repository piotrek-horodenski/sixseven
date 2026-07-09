import { model, Schema } from 'mongoose'

/**
 * rooms — kolekcja SUBSKRYBOWALNA (gate wystawia z polityką: publiczne otwarte
 * LUB własne — patrz subscriptions/policies.ts). Pokój to lobby zakładane przez
 * hosta (użytkownika); dołączają gracze zalogowani (socket) oraz goście (REST,
 * wejście z linku `/r/CODE`). `rooms:start` woła games `create-match` i wiąże
 * `matchId`.
 *
 * `code` — 6 znaków [A-Z2-9] (bez 0/1/O/I dla czytelności), unikalny, indeksowany.
 * `expiresAt` — TTL 24h (expireAfterSeconds: 0): porzucone pokoje znikają same.
 */
const memberSchema = new Schema(
  {
    id: { type: String, required: true },     // user._id lub guestId
    kind: { type: String, enum: ['user', 'guest'], required: true },
    nick: String,
  },
  { _id: false },
)

export const RoomSchema = new Schema({
  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },

  code: { type: String, required: true, unique: true, index: true },
  gameId: { type: String, required: true },
  name: { type: String, default: '' },

  hostId: { type: String, required: true },
  hostKind: { type: String, enum: ['user', 'guest'], default: 'user' },

  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  status: { type: String, enum: ['open', 'matched', 'closed'], default: 'open' },

  members: { type: [memberSchema], default: [] },

  matchId: { type: String, default: null },

  // TTL: porzucone pokoje wygasają po 24h (Date z indexem expireAfterSeconds: 0).
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
})

RoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Room = model('rooms', RoomSchema)
