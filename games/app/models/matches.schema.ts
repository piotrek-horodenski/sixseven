import { model, Schema } from 'mongoose'

/**
 * matches — kolekcja SUBSKRYBOWALNA (gate wystawia z polityką row-level:
 * `players zawiera user` LUB mecz publiczny z okrojonymi polami).
 *
 * Trzyma jawny stan sterujący meczem: faza, runda, deadline następnego
 * automatycznego przejścia, mapa `ready` (bez treści ruchów!), wynik, opcje.
 * Treść ruchów NIGDY tu nie trafia — żyje w prywatnej `moves` (I1).
 *
 * `deadline` = znacznik czasu (ms epoch) najbliższego czasowego przejścia dla
 * bieżącej fazy (planning → close, revealing → advance, paused → cancel,
 * lobby → cancel). Jedno pole + indeks pozwala pętli harmonogramu skanować
 * przeterminowane mecze jednym zapytaniem zamiast trzymać timery w pamięci (A5).
 */
export const MatchSchema = new Schema({
  // _id jest STRINGIEM (genId = 24-hex z command-api), nie ObjectId. Dzieki temu
  // matchId jest tym samym stringiem wszedzie: token meczu, match_views.matchId,
  // moves.matchId, klient — a gate moze subskrybowac `matches` po {_id: matchId}
  // bez rzutowania string→ObjectId (surowy sterownik/silnik zapytan tego nie robi).
  _id: { type: String },
  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },

  gameId: { type: String, required: true, index: true },
  manifestVersion: { type: String, required: true }, // wersja, z którą mecz wystartował (C3)

  players: { type: [String], default: [] },   // userId zalogowanych graczy
  guestIds: { type: [String], default: [] },  // identyfikatory gości (sesja gościa)
  ranked: { type: Boolean, default: false },

  phase: {
    type: String,
    enum: ['lobby', 'planning', 'resolving', 'revealing', 'finished', 'paused', 'cancelled'],
    default: 'lobby',
    required: true,
  },
  round: { type: Number, default: 0 },

  // Najbliższe czasowe przejście dla bieżącej fazy (ms epoch). null = brak timera.
  deadline: { type: Number, default: null },

  // Ustawiane przy resolve_ok z revealem: czy runda po revealie kończy mecz.
  pendingFinish: { type: Boolean, default: false },
  // Liczba kolejnych nieudanych prób /resolve w bieżącej rundzie (steruje Paused).
  failCount: { type: Number, default: 0 },
  // Monotoniczny licznik prób /resolve w bieżącej rundzie — NIE resetuje się przy
  // resume, więc każdy wpis w resolve_log ma unikalny `attempt` (A4). Zerowany
  // przy otwarciu nowej rundy.
  attemptSeq: { type: Number, default: 0 },

  // Mapa playerId -> bool. Emitowana jako fakt „złożył ruch", nigdy treść (I1, I3).
  ready: { type: Schema.Types.Mixed, default: {} },
  score: { type: Schema.Types.Mixed, default: {} },
  options: { type: Schema.Types.Mixed, default: {} },

  // Powód zakończenia/anulowania (dla historii i UI).
  endReason: { type: String, default: null }, // 'finished' | 'cancelled_lobby' | 'cancelled_paused' | 'walkover'
})

// Pętla harmonogramu: „daj mecze w fazie czasowej z minionym deadline".
MatchSchema.index({ phase: 1, deadline: 1 })

export const Match = model('matches', MatchSchema)
