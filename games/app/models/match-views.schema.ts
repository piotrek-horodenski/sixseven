import { model, Schema } from 'mongoose'

/**
 * match_views — kolekcja SUBSKRYBOWALNA z BEZWZGLĘDNYM row-level: gate wstrzykuje
 * filtr `playerId == user` (polityka z Etapu 1). Nawet gdy klient podeśle
 * `{ playerId: '<cudzy>' }`, `$and` z filtrem serwera daje pustkę.
 *
 * Jeden dokument = widok jednego gracza po jednej rundzie (to, co temu graczowi
 * wolno zobaczyć). Zapisywane atomowo razem z `match_events` i `matches` (A2),
 * więc klient nigdy nie widzi nowej fazy bez nowego widoku.
 */
export const MatchViewSchema = new Schema({
  matchId: { type: String, required: true },
  playerId: { type: String, required: true, index: true },
  round: { type: Number, required: true },

  view: { type: Schema.Types.Mixed, default: null },

  updatedAt: { type: Number, default: () => Date.now() },
})

MatchViewSchema.index({ matchId: 1, playerId: 1 })

export const MatchView = model('match_views', MatchViewSchema)
