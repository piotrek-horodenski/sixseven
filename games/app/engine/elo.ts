/**
 * ELO — CZYSTY moduł ratingu (Etap 4e, kontrakt §2 „ELO"). Bez DB, bez IO,
 * bez settings — wszystkie parametry żyją w JEDNYM obiekcie konfiguracyjnym
 * z defaultami (żadnych stałych rozsianych po kodzie). Efekty (odczyt/zapis
 * `ratings`, garda idempotencji `eloApplied`) wykonuje engine.
 *
 * Zasada E1 (testowalność): `replayElo` odtwarza stan ratings z samej
 * sekwencji wyników — bez bazy, deterministycznie.
 */

export interface EloConfig {
  /** Rating startowy — brak wpisu w `ratings` traktujemy jak ten (kontrakt §Rozstrzygnięcia). */
  startElo: number
  /** Próg „nowego gracza": matches < newPlayerMatches → K = kNew. */
  newPlayerMatches: number
  kNew: number
  /** Próg wysokiego elo: elo >= highEloThreshold → K = kHigh. */
  highEloThreshold: number
  kHigh: number
  /** K dla wszystkich pozostałych. */
  kDefault: number
  /** Wygrany walkoweru dostaje wygraną z K przeskalowanym tym mnożnikiem (pół K). */
  walkoverWinnerKScale: number
  /** Walkower z rozłączenia po N KOLEJNYCH rundach z defaultMove (kontrakt: 2). */
  defaultedStreakLimit: number
}

export const defaultEloConfig: EloConfig = {
  startElo: 1200,
  newPlayerMatches: 30,
  kNew: 32,
  highEloThreshold: 2400,
  kHigh: 10,
  kDefault: 16,
  walkoverWinnerKScale: 0.5,
  defaultedStreakLimit: 2,
}

export interface PlayerRating {
  elo: number
  /** Rozegrane mecze rankingowe (steruje progiem kNew). */
  matches: number
}

export interface RatingUpdate {
  elo: number
  matches: number
  /** K użyte przy tej aktualizacji (informacyjnie — trafia do `ratings.k`). */
  k: number
}

/** Oczekiwany wynik gracza o ratingu `a` przeciw `b`: 1 / (1 + 10^((b-a)/400)). */
export function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}

/**
 * K gracza wg progów kontraktu — kolejność MA znaczenie (jak zapisano):
 * matches < 30 → kNew; elo ≥ 2400 → kHigh; inaczej kDefault.
 */
export function kFor(player: PlayerRating, config: EloConfig = defaultEloConfig): number {
  if (player.matches < config.newPlayerMatches) return config.kNew
  if (player.elo >= config.highEloThreshold) return config.kHigh
  return config.kDefault
}

/** delta = K * (score − expected); elo zaokrąglane do całości po każdej aktualizacji. */
function applyDelta(player: PlayerRating, score: number, opponentElo: number, k: number): RatingUpdate {
  const delta = k * (score - expected(player.elo, opponentElo))
  return { elo: Math.round(player.elo + delta), matches: player.matches + 1, k }
}

/**
 * Normalny finish rankingowy pary: `scoreA` ∈ {1, 0.5, 0} (wygrana/remis/przegrana
 * gracza A), scoreB = 1 − scoreA. Każdy gracz gra z WŁASNYM K.
 */
export function updatePair(
  a: PlayerRating,
  b: PlayerRating,
  scoreA: number,
  config: EloConfig = defaultEloConfig,
): { a: RatingUpdate; b: RatingUpdate } {
  return {
    a: applyDelta(a, scoreA, b.elo, kFor(a, config)),
    b: applyDelta(b, 1 - scoreA, a.elo, kFor(b, config)),
  }
}

/**
 * Walkower (kontrakt §2): porzucający/rozłączony — PRZEGRANA z PEŁNYM jego K;
 * wygrany — WYGRANA z K/2 (walkoverWinnerKScale).
 */
export function updateWalkover(
  winner: PlayerRating,
  loser: PlayerRating,
  config: EloConfig = defaultEloConfig,
): { winner: RatingUpdate; loser: RatingUpdate } {
  return {
    winner: applyDelta(winner, 1, loser.elo, kFor(winner, config) * config.walkoverWinnerKScale),
    loser: applyDelta(loser, 0, winner.elo, kFor(loser, config)),
  }
}

// ─── replayElo (zasada E1) ───────────────────────────────────────────────────

/**
 * Pojedynczy wynik meczu w sekwencji replay. Remis: `winnerId`/`loserId` = null
 * i skład pary w `players` (kształt kontraktu rozszerzony o `players`, bo sam
 * podwójny null nie identyfikuje remisujących).
 */
export interface ReplayResult {
  winnerId: string | null
  loserId: string | null
  /** Wymagane przy remisie (winnerId i loserId null): para remisujących. */
  players?: [string, string]
  walkover?: boolean
}

/**
 * Czysta funkcja replay: odtwarza stan ratings (per userId) z sekwencji wyników.
 * Nieznany gracz startuje z { elo: startElo, matches: 0 }.
 */
export function replayElo(
  results: ReplayResult[],
  config: EloConfig = defaultEloConfig,
): Record<string, RatingUpdate> {
  const state: Record<string, RatingUpdate> = {}
  const getOrStart = (id: string): PlayerRating =>
    state[id] ?? { elo: config.startElo, matches: 0 }

  for (const r of results) {
    if (r.winnerId && r.loserId) {
      const winner = getOrStart(r.winnerId)
      const loser = getOrStart(r.loserId)
      if (r.walkover) {
        const upd = updateWalkover(winner, loser, config)
        state[r.winnerId] = upd.winner
        state[r.loserId] = upd.loser
      } else {
        const upd = updatePair(winner, loser, 1, config)
        state[r.winnerId] = upd.a
        state[r.loserId] = upd.b
      }
    } else if (r.players && r.players.length === 2) {
      // Remis na szczycie: 0.5/0.5.
      const [pa, pb] = r.players
      const upd = updatePair(getOrStart(pa), getOrStart(pb), 0.5, config)
      state[pa] = upd.a
      state[pb] = upd.b
    }
    // Wpis bez zwycięzcy i bez pary = nieoznaczalny → pomijany (odporność replay).
  }
  return state
}

// ─── Rozstrzygnięcie ELO zakończonego meczu (garda czysta) ───────────────────

/** Podzbiór dokumentu `matches` potrzebny do decyzji o naliczeniu ELO. */
export interface FinishedMatchLike {
  phase: string
  endReason?: string | null
  ranked?: boolean
  eloApplied?: boolean
  players: string[]
  guestIds: string[]
  score: Record<string, number>
  walkover?: { loserId: string; winnerId: string; reason?: string } | null
}

export interface UserRatingUpdate extends RatingUpdate {
  userId: string
}

/**
 * Czysta decyzja: czy i jak naliczyć ELO za zakończony mecz. Zwraca null, gdy
 * mecz NIE podlega naliczeniu (kontrakt §2 „Aplikacja"):
 * - nie ranked / eloApplied już true (idempotencja),
 * - jakikolwiek gość w składzie (guestIds niepuste),
 * - mecz nie jest `finished` lub jest anulowany (cancelled nie dotyka ELO),
 * - skład inny niż dokładnie 2 userów (ELO parowe; kolejka tworzy tylko 2-os.).
 *
 * Walkower (match.walkover) → reguły walkoweru; inaczej zwycięzca = argmax
 * score, remis na szczycie = 0.5/0.5.
 */
export function settleMatchElo(
  match: FinishedMatchLike,
  ratings: Record<string, PlayerRating>,
  config: EloConfig = defaultEloConfig,
): UserRatingUpdate[] | null {
  if (!match.ranked || match.eloApplied) return null
  if (match.phase !== 'finished') return null
  if (typeof match.endReason === 'string' && match.endReason.startsWith('cancelled')) return null
  if ((match.guestIds ?? []).length > 0) return null
  const players = match.players ?? []
  if (players.length !== 2) return null

  const [pa, pb] = players
  const ra = ratings[pa] ?? { elo: config.startElo, matches: 0 }
  const rb = ratings[pb] ?? { elo: config.startElo, matches: 0 }

  if (match.walkover && match.walkover.loserId && match.walkover.winnerId) {
    const { loserId, winnerId } = match.walkover
    if (!players.includes(loserId) || !players.includes(winnerId) || loserId === winnerId) return null
    const winner = ratings[winnerId] ?? { elo: config.startElo, matches: 0 }
    const loser = ratings[loserId] ?? { elo: config.startElo, matches: 0 }
    const upd = updateWalkover(winner, loser, config)
    return [
      { userId: winnerId, ...upd.winner },
      { userId: loserId, ...upd.loser },
    ]
  }

  const sa = Number(match.score?.[pa] ?? 0)
  const sb = Number(match.score?.[pb] ?? 0)
  const scoreA = sa > sb ? 1 : sa < sb ? 0 : 0.5
  const upd = updatePair(ra, rb, scoreA, config)
  return [
    { userId: pa, ...upd.a },
    { userId: pb, ...upd.b },
  ]
}

// ─── Walkower z rozłączenia (kontrakt §2 „Walkower z rozłączenia") ───────────

/**
 * Czysta decyzja po zastosowaniu wyniku rundy meczu RANKED: kto (jeśli ktokolwiek)
 * przegrywa walkowerem z powodu `defaultedStreak >= defaultedStreakLimit`.
 * Obaj naraz → `{ cancelBoth: true }` (mecz anulowany bez ELO — przypadek
 * patologiczny). Nikt → null.
 */
export function defaultedWalkoverLoser(
  defaultedStreak: Record<string, number>,
  players: string[],
  config: EloConfig = defaultEloConfig,
): { loserId: string } | { cancelBoth: true } | null {
  const over = players.filter((pid) => (defaultedStreak?.[pid] ?? 0) >= config.defaultedStreakLimit)
  if (over.length === 0) return null
  if (over.length >= 2) return { cancelBoth: true }
  return { loserId: over[0] }
}
