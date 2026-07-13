/**
 * Matchmaker — CZYSTA logika parowania kolejki szybkiego meczu (Etap 4e,
 * kontrakt §2 „Pętla matchmakera"). Bez DB/IO: scheduler dostarcza wpisy
 * `waiting` posortowane po `since` (FIFO), a tu tylko decydujemy, KTÓRE pary
 * powstają. Parametry w jednym obiekcie konfiguracyjnym z defaultami.
 *
 * Reguła okna: |Δelo| ≤ baseWindow + windowStep za każde PEŁNE windowStepMs
 * czekania, twardy sufit maxWindow. Okno pary = SZERSZE z okien obu graczy
 * (rozszerzone okno długo czekającego pozwala mu dosięgnąć świeżych wpisów —
 * inaczej rozszerzanie nie miałoby efektu). Przy MVP wszyscy mają 1200, więc
 * efektywnie czyste FIFO.
 */

export interface MatchmakerConfig {
  /** Bazowe okno |Δelo| pary. */
  baseWindow: number
  /** Rozszerzenie okna za każde pełne windowStepMs czekania. */
  windowStep: number
  windowStepMs: number
  /** Twardy sufit okna. */
  maxWindow: number
  /** Czas na akcept propozycji (proposalDeadline = now + to). */
  acceptTimeoutMs: number
  /** Watchdog wpisów `matched`: starsze niż to → delete (sprzątanie schedulera). */
  matchedTtlMs: number
  /** Co ile scheduler odpala tick matchmakera. */
  tickIntervalMs: number
}

export const defaultMatchmakerConfig: MatchmakerConfig = {
  baseWindow: 100,
  windowStep: 50,
  windowStepMs: 10_000,
  maxWindow: 400,
  acceptTimeoutMs: 10_000,
  matchedTtlMs: 60_000,
  tickIntervalMs: 2_000,
}

/** Minimalny kształt wpisu kolejki potrzebny do parowania. */
export interface QueueCandidate {
  userId: string
  elo: number
  since: number
}

/** Okno |Δelo| gracza czekającego od `since` (pełne kroki, sufit maxWindow). */
export function eloWindow(waitedMs: number, config: MatchmakerConfig = defaultMatchmakerConfig): number {
  const steps = Math.max(0, Math.floor(waitedMs / config.windowStepMs))
  return Math.min(config.baseWindow + steps * config.windowStep, config.maxWindow)
}

/**
 * Parowanie FIFO: wpisy sortowane po `since` (rosnąco; remis czasu → userId dla
 * determinizmu). Zachłannie: najdłużej czekający bierze PIERWSZEGO (w porządku
 * FIFO) niesparowanego kandydata w oknie pary. Nieparzysty/pozostali czekają.
 */
export function proposePairs(
  entries: QueueCandidate[],
  config: MatchmakerConfig = defaultMatchmakerConfig,
  now: number = Date.now(),
): [QueueCandidate, QueueCandidate][] {
  const sorted = [...entries].sort((a, b) => a.since - b.since || a.userId.localeCompare(b.userId))
  const paired = new Set<string>()
  const pairs: [QueueCandidate, QueueCandidate][] = []

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    if (paired.has(a.userId)) continue
    const windowA = eloWindow(now - a.since, config)
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (paired.has(b.userId)) continue
      const windowB = eloWindow(now - b.since, config)
      if (Math.abs(a.elo - b.elo) <= Math.max(windowA, windowB)) {
        paired.add(a.userId)
        paired.add(b.userId)
        pairs.push([a, b])
        break
      }
    }
  }
  return pairs
}

/**
 * Powrót wpisu do kolejki po wygaśnięciu propozycji (kontrakt §2): kto
 * zaakceptował — wraca BEZ zmiany `since`; kto nie — na KONIEC kolejki
 * (`since = now`). Czysta funkcja (unit-test bez schedulera).
 */
export function requeueAfterExpiry(
  entry: { accepted: boolean; since: number },
  now: number,
): { status: 'waiting'; since: number } {
  return { status: 'waiting', since: entry.accepted ? entry.since : now }
}
