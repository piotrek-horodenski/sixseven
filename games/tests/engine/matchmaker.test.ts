import { describe, it, expect } from 'vitest'

import {
  defaultMatchmakerConfig,
  eloWindow,
  proposePairs,
  requeueAfterExpiry,
  QueueCandidate,
} from '../../app/engine/matchmaker'

/**
 * matchmaker.ts — czysta logika parowania kolejki (Etap 4e, kontrakt §2 „Pętla
 * matchmakera" + §5 GAMES unit): FIFO, okno ELO, rozszerzanie za czekanie,
 * twardy max, powrót po accept-timeout.
 */

const NOW = 1_000_000

function entry(userId: string, elo: number, waitedMs = 0): QueueCandidate {
  return { userId, elo, since: NOW - waitedMs }
}

describe('matchmaker — eloWindow', () => {
  it('bazowe okno 100, +50 za każde PEŁNE 10 s czekania', () => {
    expect(eloWindow(0)).toBe(100)
    expect(eloWindow(9_999)).toBe(100)  // niepełny krok się nie liczy
    expect(eloWindow(10_000)).toBe(150)
    expect(eloWindow(25_000)).toBe(200) // 2 pełne kroki
  })

  it('twardy sufit 400 niezależnie od czasu czekania', () => {
    expect(eloWindow(60_000)).toBe(400)  // 100 + 6*50 = 400
    expect(eloWindow(3_600_000)).toBe(400)
  })

  it('parametry okna są konfigiem', () => {
    const cfg = { ...defaultMatchmakerConfig, baseWindow: 10, windowStep: 5, windowStepMs: 1000, maxWindow: 20 }
    expect(eloWindow(0, cfg)).toBe(10)
    expect(eloWindow(1000, cfg)).toBe(15)
    expect(eloWindow(9000, cfg)).toBe(20) // sufit
  })
})

describe('matchmaker — proposePairs (FIFO)', () => {
  it('równe elo (MVP: wszyscy 1200) → czyste FIFO po since', () => {
    const entries = [
      entry('d', 1200, 1_000),
      entry('a', 1200, 40_000),
      entry('c', 1200, 10_000),
      entry('b', 1200, 30_000),
    ]
    const pairs = proposePairs(entries, defaultMatchmakerConfig, NOW)
    expect(pairs).toHaveLength(2)
    expect(pairs[0].map((e) => e.userId)).toEqual(['a', 'b'])
    expect(pairs[1].map((e) => e.userId)).toEqual(['c', 'd'])
  })

  it('nieparzysta liczba → ostatni (najkrócej czekający) zostaje bez pary', () => {
    const pairs = proposePairs(
      [entry('a', 1200, 3000), entry('b', 1200, 2000), entry('c', 1200, 1000)],
      defaultMatchmakerConfig,
      NOW,
    )
    expect(pairs).toHaveLength(1)
    expect(pairs[0].map((e) => e.userId)).toEqual(['a', 'b'])
  })

  it('pusta/1-osobowa kolejka → brak par', () => {
    expect(proposePairs([], defaultMatchmakerConfig, NOW)).toEqual([])
    expect(proposePairs([entry('a', 1200)], defaultMatchmakerConfig, NOW)).toEqual([])
  })

  it('nie mutuje wejścia (czysta funkcja)', () => {
    const entries = [entry('b', 1200, 1000), entry('a', 1200, 2000)]
    const copy = entries.map((e) => ({ ...e }))
    proposePairs(entries, defaultMatchmakerConfig, NOW)
    expect(entries).toEqual(copy)
  })
})

describe('matchmaker — okno ELO', () => {
  it('|Δelo| > okna → brak pary; |Δelo| = okno → para', () => {
    expect(proposePairs([entry('a', 1200), entry('b', 1301)], defaultMatchmakerConfig, NOW)).toEqual([])
    const pairs = proposePairs([entry('a', 1200), entry('b', 1300)], defaultMatchmakerConfig, NOW)
    expect(pairs).toHaveLength(1)
  })

  it('okno pary = szersze z okien obu graczy (długo czekający dosięga świeżych)', () => {
    // a czeka 20 s → okno 200; b świeży → okno 100; Δ=150 → para dzięki oknu a.
    const pairs = proposePairs([entry('a', 1200, 20_000), entry('b', 1350, 0)], defaultMatchmakerConfig, NOW)
    expect(pairs).toHaveLength(1)
  })

  it('rozszerzanie ma twardy sufit 400 — Δ 401 nigdy nie paruje', () => {
    expect(proposePairs([entry('a', 1200, 3_600_000), entry('b', 1601, 3_600_000)], defaultMatchmakerConfig, NOW)).toEqual([])
    const pairs = proposePairs([entry('a', 1200, 3_600_000), entry('b', 1600, 0)], defaultMatchmakerConfig, NOW)
    expect(pairs).toHaveLength(1)
  })

  it('FIFO bierze PIERWSZEGO kandydata w oknie, nie najbliższego elo', () => {
    // a (najstarszy) najpierw próbuje b (starszy od c) — b w oknie, więc a-b,
    // mimo że c ma elo identyczne z a.
    const entries = [
      entry('a', 1200, 30_000),
      entry('b', 1280, 20_000),
      entry('c', 1200, 10_000),
    ]
    const pairs = proposePairs(entries, defaultMatchmakerConfig, NOW)
    expect(pairs[0].map((e) => e.userId)).toEqual(['a', 'b'])
  })

  it('poza oknem pierwszego kandydata paruje z następnym w kolejce', () => {
    const entries = [
      entry('a', 1200, 0),
      entry('b', 1800, 0), // poza oknem a
      entry('c', 1250, 0), // w oknie a
    ]
    const pairs = proposePairs(entries, defaultMatchmakerConfig, NOW)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].map((e) => e.userId)).toEqual(['a', 'c'])
  })
})

describe('matchmaker — requeueAfterExpiry (accept-timeout, kontrakt §2)', () => {
  it('kto zaakceptował → wraca do waiting BEZ zmiany since', () => {
    expect(requeueAfterExpiry({ accepted: true, since: 123 }, NOW)).toEqual({ status: 'waiting', since: 123 })
  })

  it('kto nie zaakceptował → koniec kolejki (since = now)', () => {
    expect(requeueAfterExpiry({ accepted: false, since: 123 }, NOW)).toEqual({ status: 'waiting', since: NOW })
  })
})
