import { model, Schema } from 'mongoose'

/**
 * Wiadomości czatu (Etap 4b). Jedna kolekcja obsługuje czat pokoju i meczu przez
 * `scope`/`scopeId`. Widoczność wymusza POLITYKA subskrypcji gate po
 * zdenormalizowanej tablicy `members` (userId uprawnionych do odczytu w chwili
 * wysłania) — patrz `subscriptions/policies.ts` (`messages`). Snapshot `members`
 * jest odporny na późniejsze zmiany składu pokoju/meczu.
 */
export const MessageSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  scope: { type: String, enum: ['room', 'match', 'dm'], required: true },
  scopeId: { type: String, index: true }, // roomId / matchId / kanał DM (para userId)
  authorId: String, // String(user._id) LUB playerId (token meczu)
  authorNick: String, // denorm do wyświetlenia
  text: String, // maks długość egzekwowana serwerowo (chat handler)
  members: { type: [String], default: [] }, // userId uprawnionych do odczytu (snapshot)
  ts: { type: Number, default: () => Date.now() },
})

// Odczyt „wiadomości scope'u w kolejności czasu" — wspiera subskrypcję i paginację.
MessageSchema.index({ scope: 1, scopeId: 1, ts: 1 })

export const Message = model('messages', MessageSchema)
