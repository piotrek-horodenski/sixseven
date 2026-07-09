import { model, Schema } from 'mongoose'

/**
 * registrations — kolekcja PRYWATNA games (gate nigdy jej nie wystawia; trzyma
 * sekrety HMAC). Mapuje `gameId` na zdalny serwis logiki gry: URL `/resolve`,
 * sekret podpisu i manifest.
 *
 * W 2c wpisy powstają przez `registerGame` (seed/ręcznie, dogfooding). Pełny
 * self-service pipeline (walidacja, kontrakt-testy, approve) dochodzi w Etapie 5.
 */
export const RegistrationSchema = new Schema({
  gameId: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  version: { type: String, required: true },

  /** Pełny URL endpointu `/resolve` serwisu gry. */
  serviceUrl: { type: String, required: true },
  /** Sekret HMAC współdzielony z twórcą (sekret — dlatego kolekcja prywatna). */
  hmacSecret: { type: String, required: true },
  manifest: { type: Schema.Types.Mixed, default: {} },

  status: { type: String, enum: ['active', 'disabled'], default: 'active' },

  createdAt: { immutable: true, type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },
})

RegistrationSchema.index({ gameId: 1 }, { unique: true })

export const Registration = model('registrations', RegistrationSchema)
