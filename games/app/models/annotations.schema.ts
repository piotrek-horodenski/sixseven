import { model, Schema } from 'mongoose'

/**
 * annotations — kolekcja SUBSKRYBOWALNA (exposed). Odznaki / adnotacje przyznane
 * graczowi (np. po meczu). Widoczność egzekwuje POLITYKA gate (Etap 4b, kontrakt
 * decyzja #4): `sentiment='positive'` publiczne, `neutral`/`negative` widzi tylko
 * właściciel (`playerId == user._id`). Gate NIE ma własnego modelu — czyta tę
 * kolekcję surowym sterownikiem + polityką; tu jest jedyne źródło kształtu.
 *
 * Zapis idzie przez `/command/annotate` i jest MINIMALNY (Etap 4b) — bez walidacji
 * z puli manifestu (badgeId/params kontra manifest gry). Pełna walidacja: Etap 5.
 */
export const AnnotationSchema = new Schema({
  playerId: { type: String, required: true },   // String(user._id) — odbiorca odznaki
  gameId: { type: String, required: true },     // gra, w której przyznano
  badgeId: { type: String, required: true },    // identyfikator odznaki (walidacja z manifestu: Etap 5)

  params: { type: Schema.Types.Mixed, default: {} }, // dane szczegółowe odznaki (≤ ~1 KB, egzekwowane w /annotate)
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    required: true,
  },

  earnedAt: { type: Number, default: () => Date.now() },
  createdAt: { immutable: true, type: Number, default: () => Date.now() },
})

// Filtr polityki gate i odczyt profilu operują po playerId (+ zawężenie po grze).
// Compound {playerId,gameId} pokrywa też zapytania po samym prefiksie playerId.
AnnotationSchema.index({ playerId: 1, gameId: 1 })

export const Annotation = model('annotations', AnnotationSchema)
