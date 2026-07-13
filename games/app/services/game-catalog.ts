/**
 * Walidacja rejestracji gry (Etap 4d, kontrakt §2 „register-game") — CZYSTE
 * funkcje bez DB/IO, użyte przez command-api i testowalne wprost.
 *
 * Manifest w katalogu to podzbiór PUBLICZNY: walidacja jednocześnie NORMALIZUJE
 * (odcina nieznane pola), więc do subskrybowalnej kolekcji `games` nigdy nie
 * przecieka nic spoza kontraktu.
 */

import type { Sentiment } from '../command-api'

/** Slug gameId: /^[a-z0-9-]{3,32}$/ (kontrakt §1). */
export const GAME_ID_PATTERN = /^[a-z0-9-]{3,32}$/

/** Semver X.Y.Z (opcjonalny sufiks pre-release) — zgodność z registrations.version (C3). */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

/** Zarezerwowane gameId gier first-party — dev nigdy ich nie zajmie. */
export const RESERVED_GAME_IDS: readonly string[] = ['rps']

export interface CatalogConfig {
  /** Limit gier per konto dewelopera (kontrakt: decyzja sesji, default 5). */
  maxGamesPerDev: number
  /** Twarda dolna granica planningPhaseMs (kontrakt §1: ≥ 2000). */
  planningPhaseMinMs: number
  /** Limit długości nazwy gry (sanity). */
  maxNameLength: number
}

export const defaultCatalogConfig: CatalogConfig = {
  maxGamesPerDev: 5,
  planningPhaseMinMs: 2000,
  maxNameLength: 64,
}

const VALID_SENTIMENTS: readonly Sentiment[] = ['positive', 'neutral', 'negative']

export interface PublicBadge {
  badgeId: string
  sentiment: Sentiment
  labelKey?: string
}

/** Podzbiór PUBLICZNY manifestu (kontrakt §1 `games.manifest`) — bez sekretów. */
export interface PublicManifest {
  version: string
  minPlayers: number
  maxPlayers: number
  planningPhaseMs: number
  defaultTarget?: number
  badges?: PublicBadge[]
  playerPrefs?: unknown
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Poprawny absolutny URL http(s) (serviceUrl/uiUrl). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Waliduje i NORMALIZUJE manifest publiczny: version semver, minPlayers ≥ 2,
 * maxPlayers ≥ minPlayers, planningPhaseMs ≥ config.planningPhaseMinMs (twarda),
 * sentiment odznak z enum. Zwraca WYŁĄCZNIE pola kontraktu.
 */
export function validateManifest(
  input: unknown,
  config: CatalogConfig = defaultCatalogConfig,
): ValidationResult<PublicManifest> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'manifest must be an object' }
  }
  const m = input as Record<string, unknown>

  if (typeof m.version !== 'string' || !SEMVER_PATTERN.test(m.version)) {
    return { ok: false, error: 'manifest.version must be semver (X.Y.Z)' }
  }
  const minPlayers = Number(m.minPlayers)
  if (!Number.isInteger(minPlayers) || minPlayers < 2) {
    return { ok: false, error: 'manifest.minPlayers must be an integer >= 2' }
  }
  const maxPlayers = Number(m.maxPlayers)
  if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers) {
    return { ok: false, error: 'manifest.maxPlayers must be an integer >= minPlayers' }
  }
  const planningPhaseMs = Number(m.planningPhaseMs)
  if (!Number.isFinite(planningPhaseMs) || planningPhaseMs < config.planningPhaseMinMs) {
    return { ok: false, error: `manifest.planningPhaseMs must be >= ${config.planningPhaseMinMs}` }
  }

  const out: PublicManifest = { version: m.version, minPlayers, maxPlayers, planningPhaseMs }

  if (m.defaultTarget !== undefined) {
    const t = Number(m.defaultTarget)
    if (!Number.isInteger(t) || t < 1) {
      return { ok: false, error: 'manifest.defaultTarget must be an integer >= 1' }
    }
    out.defaultTarget = t
  }

  if (m.badges !== undefined) {
    if (!Array.isArray(m.badges)) return { ok: false, error: 'manifest.badges must be an array' }
    const badges: PublicBadge[] = []
    for (const raw of m.badges) {
      const b = raw as Record<string, unknown>
      if (typeof b !== 'object' || b === null || typeof b.badgeId !== 'string' || !b.badgeId) {
        return { ok: false, error: 'each badge requires badgeId' }
      }
      if (!VALID_SENTIMENTS.includes(b.sentiment as Sentiment)) {
        return { ok: false, error: 'badge sentiment must be positive|neutral|negative' }
      }
      const badge: PublicBadge = { badgeId: b.badgeId, sentiment: b.sentiment as Sentiment }
      if (typeof b.labelKey === 'string' && b.labelKey) badge.labelKey = b.labelKey
      badges.push(badge)
    }
    out.badges = badges
  }

  if (m.playerPrefs !== undefined) {
    if (typeof m.playerPrefs !== 'object' || m.playerPrefs === null) {
      return { ok: false, error: 'manifest.playerPrefs must be an object' }
    }
    // Schemat prefs (kształt jak RPS) — przepuszczany bez głębokiej walidacji (Etap 5).
    out.playerPrefs = m.playerPrefs
  }

  return { ok: true, value: out }
}

export interface RegisterGameCandidate {
  gameId: string
  name: string
  manifest: PublicManifest
  serviceUrl: string
  uiUrl: string
}

/**
 * Pełna walidacja wejścia register-game (bez unikalności/limitu — te wymagają
 * odczytu katalogu i żyją w command-api na wstrzykiwalnym store).
 */
export function validateRegisterGame(
  input: { gameId?: unknown; name?: unknown; manifest?: unknown; serviceUrl?: unknown; uiUrl?: unknown },
  config: CatalogConfig = defaultCatalogConfig,
): ValidationResult<RegisterGameCandidate> {
  if (typeof input.gameId !== 'string' || !GAME_ID_PATTERN.test(input.gameId)) {
    return { ok: false, error: 'gameId must match /^[a-z0-9-]{3,32}$/' }
  }
  if (RESERVED_GAME_IDS.includes(input.gameId)) {
    return { ok: false, error: 'gameId is reserved' }
  }
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > config.maxNameLength) {
    return { ok: false, error: `name required (max ${config.maxNameLength} chars)` }
  }
  if (!isHttpUrl(input.serviceUrl)) {
    return { ok: false, error: 'serviceUrl must be a valid http(s) URL' }
  }
  if (!isHttpUrl(input.uiUrl)) {
    return { ok: false, error: 'uiUrl must be a valid http(s) URL' }
  }
  const manifest = validateManifest(input.manifest, config)
  if (!manifest.ok) return manifest
  return {
    ok: true,
    value: {
      gameId: input.gameId,
      name: input.name.trim(),
      manifest: manifest.value,
      serviceUrl: input.serviceUrl,
      uiUrl: input.uiUrl,
    },
  }
}
