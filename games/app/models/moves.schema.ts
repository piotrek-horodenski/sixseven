import { model, Schema } from 'mongoose'

/**
 * moves — kolekcja PRYWATNA games (gate NIGDY jej nie wystawia; chroni ją
 * default-deny z Etapu 1). Sekret w stanach 2–4 cyklu życia ruchu.
 *
 * Jeden dokument = ruch jednego gracza w jednej rundzie. Nadpisanie ruchu do
 * deadline pisze WYŁĄCZNIE tutaj (I4) — nigdy do kolekcji subskrybowalnej, więc
 * „przeciwnik zmienia zdanie N razy" nie jest obserwowalną informacją (A3).
 *
 * Unikalny indeks (matchId, round, playerId) egzekwuje „jeden ruch na gracza na
 * rundę" na poziomie bazy — nadpisanie to upsert po tym kluczu.
 */
export const MoveSchema = new Schema({
  matchId: { type: String, required: true },
  round: { type: Number, required: true },
  playerId: { type: String, required: true },

  move: { type: Schema.Types.Mixed, default: null }, // treść ruchu — sekret
  ready: { type: Boolean, default: false },

  submittedAt: { type: Number, default: () => Date.now() },
})

MoveSchema.index({ matchId: 1, round: 1, playerId: 1 }, { unique: true })

export const Move = model('moves', MoveSchema)
