import { model, Schema } from 'mongoose'

/**
 * games — KATALOG GIER (Etap 4d, kontrakt §1). Kolekcja PUBLICZNA
 * subskrybowalna; pisze WYŁĄCZNIE serwis games. Polityka gate (row-level):
 * `{ $or: [ { status: 'published' }, { devAccountId: user._id } ] }`;
 * gość widzi tylko published.
 *
 * UWAGA (I1): `serviceUrl` i `hmacSecret` NIE występują w tym dokumencie —
 * żyją wyłącznie w prywatnej `registrations`. Ten dokument nie wymaga
 * sanityzacji pól. `manifest` to podzbiór PUBLICZNY manifestu (bez sekretów).
 */
export const GameCatalogSchema = new Schema({
  // _id = gameId (slug /^[a-z0-9-]{3,32}$/, podaje dev; 'rps' zarezerwowane dla builtin).
  _id: { type: String },
  name: { type: String, required: true },

  // true tylko dla gier first-party (RPS). Gry zewnętrzne NIGDY nie grają
  // ranked (ADR „Gry zewnętrzne = tylko towarzyskie").
  builtin: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['registered', 'published', 'unpublished'],
    default: 'registered',
    required: true,
  },
  // userId właściciela (ZAWSZE z tokenu po stronie gate, nigdy z payloadu
  // klienta); null dla builtin.
  devAccountId: { type: String, default: null },
  // Baza UI gry zewnętrznej (http(s)); null dla builtin.
  uiUrl: { type: String, default: null },
  rankedEligible: { type: Boolean, default: false },

  // Podzbiór publiczny manifestu: version (semver, = registrations.version, C3),
  // minPlayers ≥ 2, maxPlayers ≥ minPlayers, planningPhaseMs ≥ 2000,
  // defaultTarget?, badges? [{badgeId, sentiment, labelKey?}], playerPrefs?.
  manifest: { type: Schema.Types.Mixed, default: {} },

  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },
  publishedAt: { type: Number, default: null },
})

// Katalog publiczny (published) + widok „moje gry" dewelopera.
GameCatalogSchema.index({ status: 1 })
GameCatalogSchema.index({ devAccountId: 1 })

export const GameCatalog = model('games', GameCatalogSchema, 'games')
