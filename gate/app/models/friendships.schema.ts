import { model, Schema } from 'mongoose'

/**
 * friendships — kolekcja SUBSKRYBOWALNA (4a). Jedna krawędź relacji między dwoma
 * użytkownikami. Gate wystawia ją z polityką `{ $or: [{ a: user._id },
 * { b: user._id }] }` (RAPORT A1): user widzi tylko relacje, których jest stroną.
 *
 * NORMALIZACJA PARY (kluczowa dla braku duplikatów): przechowujemy zawsze
 * `a = min(x, y)`, `b = max(x, y)` (porównanie leksykalne stringów userId).
 * Dzięki temu relacja A↔B ma DOKŁADNIE JEDEN dokument niezależnie od tego, kto
 * kogo zaprosił — unikat `{ a: 1, b: 1 }` to egzekwuje na poziomie bazy.
 *
 * Kierunek zaproszenia (kto zaprosił) trzymamy OSOBNO w `invitedBy`, bo pozycja
 * a/b jest zdeterminowana kolejnością leksykalną, nie kierunkiem akcji. Accept
 * jest dozwolony TYLKO gdy `invitedBy != akceptujący` (nie da się zaakceptować
 * własnego zaproszenia).
 */
export const FriendshipSchema = new Schema({
  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },

  // Znormalizowana para: a < b leksykalnie. Zawsze String(user._id).
  a: { type: String, required: true, index: true },
  b: { type: String, required: true, index: true },

  status: { type: String, enum: ['invited', 'accepted'], default: 'invited' },

  // userId inicjatora zaproszenia (rozróżnia kierunek — a/b są tylko posortowane).
  invitedBy: { type: String, required: true },
})

// Unikat na znormalizowanej parze: jeden dokument na relację (anty-duplikat A→B / B→A).
FriendshipSchema.index({ a: 1, b: 1 }, { unique: true })

export const Friendship = model('friendships', FriendshipSchema)
