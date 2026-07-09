import { model, Schema } from 'mongoose'

/**
 * resolve_log — kolekcja PRYWATNA games. Paliwo replay-auditów: wejście i wyjście
 * KAŻDEGO wywołania `/resolve`, wszystkie próby retry oznaczone (A4), wersja
 * manifestu (C3). Werdykt „replay niezgodny" wymaga zgodności wersji między
 * oryginałem a powtórką.
 *
 * Retencja (E2): `expiresAt` napędza TTL-indeks — pełny log przez okno audytu,
 * potem automatyczne czyszczenie. Wpisy powiązane z otwartymi audytami należy
 * chronić przed wygaśnięciem (podniesienie `expiresAt`) — mechanizm w Etapie 5.
 */
export const ResolveLogSchema = new Schema({
  matchId: { type: String, required: true },
  round: { type: Number, required: true },
  attempt: { type: Number, required: true }, // 1..retryMax

  request: { type: Schema.Types.Mixed, default: null },  // pełne wejście do /resolve
  response: { type: Schema.Types.Mixed, default: null },  // pełne wyjście (null gdy timeout/błąd)
  manifestVersion: { type: String, required: true },
  outcome: {
    type: String,
    enum: ['ok', 'timeout', 'schema', 'error'],
    required: true,
  },
  used: { type: Boolean, default: false }, // czy to ta próba, której wynik zastosowano

  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  // TTL: dokument znika po tej dacie (Date, nie ms — wymóg TTL-indeksu Mongo).
  expiresAt: { type: Date, required: true },
})

ResolveLogSchema.index({ matchId: 1, round: 1, attempt: 1 })
// TTL-indeks: Mongo usuwa dokument, gdy expiresAt minie (expireAfterSeconds: 0).
ResolveLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const ResolveLog = model('resolve_log', ResolveLogSchema)
