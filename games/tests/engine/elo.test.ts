import { describe, it, expect } from 'vitest'

import {
  defaultEloConfig,
  expected,
  kFor,
  updatePair,
  updateWalkover,
  replayElo,
  settleMatchElo,
  defaultedWalkoverLoser,
  ReplayResult,
} from '../../app/engine/elo'

/**
 * elo.ts — czysty moduł ratingu (Etap 4e, kontrakt §2 „ELO" + §5 GAMES unit).
 * Bez bazy: progi K, remis, walkower pełne/pół K, replayElo (E1), gardy
 * naliczenia (eloApplied idempotencja, goście, cancelled).
 */
describe('elo — expected i progi K', () => {
  it('expected: równe ratingi → 0.5; +400 przewagi → ~0.909', () => {
    expect(expected(1200, 1200)).toBeCloseTo(0.5, 10)
    expect(expected(1600, 1200)).toBeCloseTo(1 / (1 + Math.pow(10, -1)), 10)
    // Symetria: expected(a,b) + expected(b,a) = 1.
    expect(expected(1300, 1150) + expected(1150, 1300)).toBeCloseTo(1, 10)
  })

  it('K: matches < 30 → 32; elo ≥ 2400 → 10; inaczej 16 (kolejność progów jak w kontrakcie)', () => {
    expect(kFor({ elo: 1200, matches: 0 })).toBe(32)
    expect(kFor({ elo: 1200, matches: 29 })).toBe(32)
    expect(kFor({ elo: 1200, matches: 30 })).toBe(16)
    expect(kFor({ elo: 2400, matches: 30 })).toBe(10)
    expect(kFor({ elo: 2500, matches: 100 })).toBe(10)
    // Nowy gracz z wysokim elo: próg „matches < 30" wygrywa (kolejność zapisu).
    expect(kFor({ elo: 2400, matches: 5 })).toBe(32)
  })

  it('progi są konfigiem, nie stałymi w kodzie', () => {
    const cfg = { ...defaultEloConfig, kNew: 40, newPlayerMatches: 10 }
    expect(kFor({ elo: 1200, matches: 9 }, cfg)).toBe(40)
    expect(kFor({ elo: 1200, matches: 10 }, cfg)).toBe(cfg.kDefault)
  })
})

describe('elo — updatePair (normalny finish)', () => {
  it('wygrana świeżego gracza z równym: ±16 (K=32, expected 0.5), matches+1', () => {
    const { a, b } = updatePair({ elo: 1200, matches: 0 }, { elo: 1200, matches: 0 }, 1)
    expect(a).toEqual({ elo: 1216, matches: 1, k: 32 })
    expect(b).toEqual({ elo: 1184, matches: 1, k: 32 })
  })

  it('remis równych: bez zmiany elo, matches+1 (score 0.5/0.5)', () => {
    const { a, b } = updatePair({ elo: 1200, matches: 0 }, { elo: 1200, matches: 0 }, 0.5)
    expect(a.elo).toBe(1200)
    expect(b.elo).toBe(1200)
    expect(a.matches).toBe(1)
    expect(b.matches).toBe(1)
  })

  it('remis nierównych: słabszy zyskuje, mocniejszy traci', () => {
    const { a, b } = updatePair({ elo: 1400, matches: 50 }, { elo: 1200, matches: 50 }, 0.5)
    expect(a.elo).toBeLessThan(1400)
    expect(b.elo).toBeGreaterThan(1200)
    expect(a.k).toBe(16)
  })

  it('każdy gracz gra z WŁASNYM K (nowy vs doświadczony)', () => {
    const { a, b } = updatePair({ elo: 1200, matches: 0 }, { elo: 1200, matches: 100 }, 1)
    expect(a.k).toBe(32)
    expect(b.k).toBe(16)
    expect(a.elo).toBe(1216) // 32 * 0.5
    expect(b.elo).toBe(1192) // -16 * 0.5
  })
})

describe('elo — walkower (pełne/pół K)', () => {
  it('porzucający przegrywa z PEŁNYM K, wygrany wygrywa z K/2', () => {
    const { winner, loser } = updateWalkover({ elo: 1200, matches: 0 }, { elo: 1200, matches: 0 })
    expect(winner).toEqual({ elo: 1208, matches: 1, k: 16 }) // K=32 * 0.5 → delta 8
    expect(loser).toEqual({ elo: 1184, matches: 1, k: 32 })  // pełne K → delta -16
  })

  it('mnożnik K wygranego jest konfigiem', () => {
    const cfg = { ...defaultEloConfig, walkoverWinnerKScale: 1 }
    const { winner } = updateWalkover({ elo: 1200, matches: 0 }, { elo: 1200, matches: 0 }, cfg)
    expect(winner.elo).toBe(1216) // pełne K także dla wygranego
  })
})

describe('elo — replayElo (zasada E1: stan ratings z sekwencji wyników)', () => {
  it('pojedyncza wygrana: zwycięzca 1216, przegrany 1184', () => {
    const state = replayElo([{ winnerId: 'a', loserId: 'b' }])
    expect(state.a).toEqual({ elo: 1216, matches: 1, k: 32 })
    expect(state.b).toEqual({ elo: 1184, matches: 1, k: 32 })
  })

  it('sekwencja wygrana → remis → walkower równa się złożeniu updatePair/updateWalkover krok po kroku', () => {
    const results: ReplayResult[] = [
      { winnerId: 'a', loserId: 'b' },
      { winnerId: null, loserId: null, players: ['a', 'b'] },
      { winnerId: 'b', loserId: 'a', walkover: true },
    ]
    const state = replayElo(results)

    // Ręczne złożenie tych samych czystych funkcji.
    let ra = { elo: 1200, matches: 0 }
    let rb = { elo: 1200, matches: 0 }
    const r1 = updatePair(ra, rb, 1)
    ra = r1.a; rb = r1.b
    const r2 = updatePair(ra, rb, 0.5)
    ra = r2.a; rb = r2.b
    const r3 = updateWalkover(rb, ra) // b wygrywa walkowerem
    expect(state.a).toEqual({ ...r3.loser })
    expect(state.b).toEqual({ ...r3.winner })
    expect(state.a.matches).toBe(3)
    expect(state.b.matches).toBe(3)
  })

  it('gracz trzeci dołącza w połowie sekwencji ze startElo', () => {
    const state = replayElo([
      { winnerId: 'a', loserId: 'b' },
      { winnerId: 'c', loserId: 'a' },
    ])
    expect(state.c.matches).toBe(1)
    // c startował z 1200 przeciw a=1216: expected < 0.5 → zysk > 16.
    expect(state.c.elo).toBeGreaterThan(1216 - 16)
  })

  it('wpis remisu bez pary graczy jest pomijany (odporność)', () => {
    const state = replayElo([{ winnerId: null, loserId: null }])
    expect(Object.keys(state)).toHaveLength(0)
  })
})

describe('elo — settleMatchElo (gardy naliczenia, kontrakt §2 „Aplikacja")', () => {
  const baseMatch = {
    phase: 'finished',
    endReason: 'finished',
    ranked: true,
    eloApplied: false,
    players: ['a', 'b'],
    guestIds: [] as string[],
    score: { a: 2, b: 1 },
    walkover: null,
  }
  const ratings = { a: { elo: 1200, matches: 0 }, b: { elo: 1200, matches: 0 } }

  it('normalny finish ranked: zwycięzca = argmax score', () => {
    const updates = settleMatchElo(baseMatch, ratings)
    expect(updates).not.toBeNull()
    expect(updates!.find((u) => u.userId === 'a')!.elo).toBe(1216)
    expect(updates!.find((u) => u.userId === 'b')!.elo).toBe(1184)
  })

  it('remis na szczycie → 0.5/0.5 (równi: bez zmiany elo)', () => {
    const updates = settleMatchElo({ ...baseMatch, score: { a: 2, b: 2 } }, ratings)
    expect(updates!.every((u) => u.elo === 1200 && u.matches === 1)).toBe(true)
  })

  it('walkower w dokumencie meczu → reguły walkoweru (pełne/pół K)', () => {
    const updates = settleMatchElo(
      { ...baseMatch, endReason: 'walkover', walkover: { loserId: 'a', winnerId: 'b' } },
      ratings,
    )
    expect(updates!.find((u) => u.userId === 'b')!.elo).toBe(1208) // K/2
    expect(updates!.find((u) => u.userId === 'a')!.elo).toBe(1184) // pełne K
  })

  it('eloApplied=true → null (idempotencja: drugi trigger nic nie liczy)', () => {
    expect(settleMatchElo({ ...baseMatch, eloApplied: true }, ratings)).toBeNull()
  })

  it('mecz nie-ranked → null', () => {
    expect(settleMatchElo({ ...baseMatch, ranked: false }, ratings)).toBeNull()
  })

  it('mecz z JAKIMKOLWIEK gościem nie dotyka ELO', () => {
    expect(settleMatchElo({ ...baseMatch, players: ['a'], guestIds: ['g_1'] }, ratings)).toBeNull()
  })

  it('cancelled nie dotyka ELO (faza i endReason)', () => {
    expect(settleMatchElo({ ...baseMatch, phase: 'cancelled', endReason: 'cancelled' }, ratings)).toBeNull()
    expect(settleMatchElo({ ...baseMatch, endReason: 'cancelled_paused' }, ratings)).toBeNull()
  })

  it('skład inny niż dokładnie 2 userów → null (ELO parowe)', () => {
    expect(settleMatchElo({ ...baseMatch, players: ['a', 'b', 'c'] }, ratings)).toBeNull()
    expect(settleMatchElo({ ...baseMatch, players: ['a'] }, ratings)).toBeNull()
  })

  it('brak wpisu w ratings → start z startElo', () => {
    const updates = settleMatchElo(baseMatch, {})
    expect(updates!.find((u) => u.userId === 'a')!.elo).toBe(1216)
  })
})

describe('elo — defaultedWalkoverLoser (walkower z rozłączenia)', () => {
  it('streak < limitu → null', () => {
    expect(defaultedWalkoverLoser({ a: 1, b: 0 }, ['a', 'b'])).toBeNull()
    expect(defaultedWalkoverLoser({}, ['a', 'b'])).toBeNull()
  })

  it('jeden gracz z ≥ 2 kolejnymi defaultami → przegrywa walkowerem', () => {
    expect(defaultedWalkoverLoser({ a: 2, b: 0 }, ['a', 'b'])).toEqual({ loserId: 'a' })
    expect(defaultedWalkoverLoser({ a: 0, b: 3 }, ['a', 'b'])).toEqual({ loserId: 'b' })
  })

  it('obaj naraz → cancelBoth (mecz anulowany bez ELO — patologiczny)', () => {
    expect(defaultedWalkoverLoser({ a: 2, b: 2 }, ['a', 'b'])).toEqual({ cancelBoth: true })
  })

  it('limit jest konfigiem', () => {
    const cfg = { ...defaultEloConfig, defaultedStreakLimit: 3 }
    expect(defaultedWalkoverLoser({ a: 2 }, ['a', 'b'], cfg)).toBeNull()
    expect(defaultedWalkoverLoser({ a: 3 }, ['a', 'b'], cfg)).toEqual({ loserId: 'a' })
  })
})
