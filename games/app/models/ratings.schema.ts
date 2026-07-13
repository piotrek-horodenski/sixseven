import { model, Schema } from 'mongoose'

/**
 * ratings — rating ELO per (gra, user) (Etap 4e, kontrakt §1). Kolekcja
 * PUBLICZNA (polityka gate: pusty filtr, bez sanityzacji); pisze games.
 *
 * `_id = ${gameId}_${userId}` — deterministyczny upsert (naliczenie ELO przy
 * finish jest idempotentne dzięki gardzie `matches.eloApplied`, a klucz
 * deterministyczny gwarantuje brak duplikatów przy wyścigu).
 */
export const RatingSchema = new Schema({
  _id: { type: String }, // `${gameId}_${userId}`
  gameId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },

  elo: { type: Number, required: true }, // start 1200 (defaultEloConfig.startElo)
  matches: { type: Number, default: 0 }, // rozegrane mecze rankingowe
  k: { type: Number, default: null },    // K użyte przy ostatniej aktualizacji (informacyjnie)

  updatedAt: { type: Number, default: () => Date.now() },
})

// Ranking gry (web: top wg elo per gameId).
RatingSchema.index({ gameId: 1, elo: -1 })

export const Rating = model('ratings', RatingSchema, 'ratings')
