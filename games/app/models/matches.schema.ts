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
  // Denormalizowane nazwy do wyświetlenia w grze (id→nick). Ustawiane przy
  // create/join z username (użytkownik) lub nicku gościa. Bez wpływu na logikę.
  nicks: { type: Schema.Types.Mixed, default: {} },
  // Kod pokoju (denorm z gate) — pozwala uczestnikom meczu pokazać link
  // zaproszenia dla gościa (`/r/CODE`), gdy roster niepełny. Bez wpływu na logikę.
  roomCode: { type: String, default: null },
  // Docelowa liczba graczy (Etap 3B pkt 1). Mecz jest „otwarty" (dołączalny), dopóki
  // players.length + guestIds.length < capacity.
  capacity: { type: Number, default: 2 },
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
  // Mapa playerId -> bool. Gotowość w fazie lobby (brama startu, Etap 3 pkt 5):
  // Planning startuje dopiero, gdy KAŻDY z rosteru (players ∪ guestIds) zgłosi
  // gotowość. Jawne pole, bez treści ruchów — jak `ready`.
  lobbyReady: { type: Schema.Types.Mixed, default: {} },
  score: { type: Schema.Types.Mixed, default: {} },
  options: { type: Schema.Types.Mixed, default: {} },

  // Powód zakończenia/anulowania (dla historii i UI).
  endReason: { type: String, default: null }, // 'finished' | 'cancelled_lobby' | 'cancelled_paused' | 'walkover'
})

// Pętla harmonogramu: „daj mecze w fazie czasowej z minionym deadline".
MatchSchema.index({ phase: 1, deadline: 1 })

// Historia gracza / gościa (Etap 4b/4c): zapytania po członkostwie w składzie.
// `players`/`guestIds` to tablice → indeks wielokluczowy. Bez nich player-history,
// guest-matches i attach-guest robiłyby collection scan (skarbiec rośnie z meczami).
MatchSchema.index({ players: 1 })
MatchSchema.index({ guestIds: 1 })

export const Match = model('matches', MatchSchema)
