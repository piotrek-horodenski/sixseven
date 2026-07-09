import { model, Schema } from 'mongoose'

/**
 * player_memory — kolekcja PRYWATNA games. Pamięć gry per gracz per gra:
 * `data` (pisane przez `/annotate` po meczu) i `prefs` (pisane tokenem meczu),
 * oba ≤ 4 KB, oba wracają w `/init`. Egzekucja limitów rozmiaru i uprawnień
 * zapisu dochodzi z pełnymi kontraktami w kolejnych podetapach; tu definiujemy
 * kształt i klucz.
 */
export const PlayerMemorySchema = new Schema({
  gameId: { type: String, required: true },
  playerId: { type: String, required: true },

  data: { type: Schema.Types.Mixed, default: {} },   // ≤ 4 KB — pisze /annotate
  prefs: { type: Schema.Types.Mixed, default: {} },  // ≤ 4 KB — pisze token meczu

  updatedAt: { type: Number, default: () => Date.now() },
})

PlayerMemorySchema.index({ gameId: 1, playerId: 1 }, { unique: true })

export const PlayerMemory = model('player_memory', PlayerMemorySchema)
