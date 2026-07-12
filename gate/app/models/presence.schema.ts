import { model, Schema } from 'mongoose'

/**
 * presence — kolekcja SUBSKRYBOWALNA (4a). Jeden dokument per użytkownik online.
 * Gate wystawia ją z polityką row-level `{ visibleTo: user._id }` (patrz
 * subscriptions/policies.ts — RAPORT A1): status widoczny WYŁĄCZNIE znajomym
 * (accepted). Obcy nie widzą użytkownika wcale.
 *
 * Model widoczności: DENORMALIZACJA `visibleTo` (Decyzja projektowa 1 kontraktu).
 * Istniejąca polityka `filter: (user) => MongoFilter` wybiera WIERSZE po
 * `user._id` i nie ma dostępu do bazy (nie policzy async „moich znajomych"),
 * więc listę uprawnionych odbiorców zapisujemy na dokumencie i filtrujemy po niej.
 *
 * Brak stanu „offline" w enumie: OFFLINE = brak dokumentu presence
 * (presence.service.goOffline usuwa dokument po zamknięciu OSTATNIEJ sesji).
 *
 * Tryb niewidzialny (Decyzja projektowa 3): gdy user ma `privacy.invisible`,
 * presence.service NIE zapisuje `currentMatchId` i degraduje `status` do
 * 'online' — sekret nie trafia nawet do dokumentu.
 */
export const PresenceSchema = new Schema({
  // userId = String(user._id). Unikat: jeden agregat sesji per użytkownik.
  userId: { type: String, required: true, unique: true, index: true },

  // Agregat sesji multi-device. Degradowany do 'online' gdy invisible.
  status: { type: String, enum: ['online', 'lobby', 'match'], default: 'online' },

  lastSeen: { type: Number, default: () => Date.now() },

  // Pomijane (null) gdy invisible — patrz presence.service.setStatus.
  currentMatchId: { type: String, default: null },

  // userId znajomych (accepted) — filtr polityki subskrypcji. Indeks wspiera
  // zapytanie polityki `{ visibleTo: user._id }` po stronie subManagera.
  visibleTo: { type: [String], default: [], index: true },

  updatedAt: { type: Number, default: () => Date.now() },
})

export const Presence = model('presence', PresenceSchema)
