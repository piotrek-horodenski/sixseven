import { model, Schema } from 'mongoose'

/**
 * queue — kolejka szybkiego meczu (Etap 4e, kontrakt §1). Pisze games; polityka
 * gate: odczyt TYLKO własnych wpisów (`{ userId: user._id }`).
 *
 * `_id = ${gameId}_${userId}` — jeden wpis per (gra, user); ponowny join jest
 * idempotentny (zachowuje `since` — „koniec kolejki" wyraża się NOWYM since).
 * Cykl: waiting → proposed (proposalId + proposalDeadline) → matched (matchId,
 * klient bierze handoff) → delete (watchdog schedulera po matchedTtlMs).
 */
export const QueueEntrySchema = new Schema({
  _id: { type: String }, // `${gameId}_${userId}`
  gameId: { type: String, required: true, index: true },
  // NIGDY gość (g_*) — kolejka tylko dla zalogowanych (podwójna gwarancja
  // ranked-bez-gości; egzekwowane też w queue-join).
  userId: { type: String, required: true, index: true },

  // Snapshot z ratings przy join (brak ratingu = startElo 1200).
  elo: { type: Number, required: true },
  // Epoch ms wejścia do kolejki; „koniec kolejki" po nieudanym akcepcie = nowy since.
  since: { type: Number, required: true },

  status: {
    type: String,
    enum: ['waiting', 'proposed', 'matched'],
    default: 'waiting',
    required: true,
  },
  // Czy gracz zaakceptował bieżącą propozycję (kontrakt: „gdy OBAJ zaakceptowali"
  // — potrzebny trwały znacznik; pole robocze, zerowane przy powrocie do waiting).
  accepted: { type: Boolean, default: false },
  proposalId: { type: String, default: null, index: true },
  proposalDeadline: { type: Number, default: null }, // now + acceptTimeoutMs przy 'proposed'
  matchId: { type: String, default: null },          // przy 'matched' — handoff i wejście do gry

  updatedAt: { type: Number, default: () => Date.now() },
})

// Tick matchmakera: waiting FIFO per gra.
QueueEntrySchema.index({ gameId: 1, status: 1, since: 1 })
// Wygasłe propozycje + watchdog matched (sprzątanie po updatedAt).
QueueEntrySchema.index({ status: 1, proposalDeadline: 1 })
QueueEntrySchema.index({ status: 1, updatedAt: 1 })

export const QueueEntry = model('queue', QueueEntrySchema, 'queue')
