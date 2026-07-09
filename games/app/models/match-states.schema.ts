import { model, Schema } from 'mongoose'

/**
 * match_states — kolekcja PRYWATNA games. Stan autorytatywny per runda + flaga
 * zapieczętowania (`sealed`).
 *
 * `sealed` (A1) to trwałe, atomowe przejście zapisywane PRZED wywołaniem
 * `/resolve`. Rehydracja po awarii: runda `sealed` → ponowny `/resolve` z tymi
 * samymi zapieczętowanymi ruchami (bezpieczne dzięki determinizmowi), runda
 * niezapieczętowana → restart fazy Planning. Log `/resolve` i ten flag razem
 * wystarczają, by powtórzyć każdą rundę bajt w bajt (I5).
 *
 * Jeden dokument per (matchId, round): stan na WEJŚCIU do tej rundy (to on idzie
 * do `/resolve`).
 */
export const MatchStateSchema = new Schema({
  matchId: { type: String, required: true },
  round: { type: Number, required: true },

  sealed: { type: Boolean, default: false },
  state: { type: Schema.Types.Mixed, default: null }, // stan autorytatywny na wejściu do rundy
  manifestVersion: { type: String, required: true },

  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },
})

MatchStateSchema.index({ matchId: 1, round: 1 }, { unique: true })

export const MatchState = model('match_states', MatchStateSchema)
