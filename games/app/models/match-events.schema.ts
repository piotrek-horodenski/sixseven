import { model, Schema } from 'mongoose'

/**
 * match_events — historia append-only (I5). Uczestnicy meczu w trakcie; po
 * zakończeniu publiczne (replay/historia). Jeden dokument = wynik jednej rundy
 * ujawniony światu (stan 5 cyklu sekretu): jawne zdarzenia, punkty, czas revealu.
 *
 * Rundy anulowanego meczu dostają `cancelled: true` — historia zostaje, ale ELO
 * i adnotacje się nie liczą.
 */
export const MatchEventSchema = new Schema({
  matchId: { type: String, required: true },
  round: { type: Number, required: true },

  events: { type: Schema.Types.Mixed, default: [] },
  points: { type: Schema.Types.Mixed, default: {} },
  revealDurationMs: { type: Number, default: 0 },
  cancelled: { type: Boolean, default: false },

  createdAt: { immutable: true, type: Number, default: () => Date.now() },
})

MatchEventSchema.index({ matchId: 1, round: 1 }, { unique: true })

export const MatchEvent = model('match_events', MatchEventSchema)
