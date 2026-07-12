import { describe, it, expect } from 'vitest'
import { runContractTests, allPassed, resolvePipeline, ResolveRequest, PlayerData } from 'sixseven-sdk'

import { rps, RpsState, RpsMove } from '../src/rps'

function initState(
  playerIds = ['p1', 'p2'],
  options: Record<string, unknown> = {},
  playerData: Record<string, PlayerData> = {},
  seed = 's',
): RpsState {
  return rps.init({ playerIds, seed, playerData, options })
}

function req(state: RpsState, moves: Record<string, string>): ResolveRequest {
  const playerIds = Object.keys(state.scores)
  return {
    matchId: 'm',
    round: 1,
    idempotencyKey: 'm:1',
    manifestVersion: rps.manifest.version,
    state,
    moves: playerIds.filter((p) => p in moves).map((p) => ({ playerId: p, move: moves[p] })),
    latePlayers: playerIds.filter((p) => !(p in moves)),
  }
}

describe('RPS — kontrakt SDK', () => {
  it('przechodzi cały harness kontrakt-testów', () => {
    const results = runContractTests(rps, { moves: { p1: 'rock', p2: 'scissors' } })
    expect(allPassed(results)).toBe(true)
  })
})

describe('RPS — reguły (2 graczy — punktacja parowa: tylko zwycięzca +1)', () => {
  it('kamień bije nożyce → wygrany +1, przegrany 0 (winner-only)', () => {
    const resp = resolvePipeline(rps, req(initState(), { p1: 'rock', p2: 'scissors' }))
    expect(resp.points).toEqual({ p1: 1, p2: 0 })
    const view = resp.views.find((v) => v.playerId === 'p1')!.view as any
    expect(view.roundPoints).toEqual({ p1: 1, p2: 0 })
    expect(view.roundWinner).toBe('p1')
    expect(view.scores).toEqual({ p1: 1, p2: 0 })
    expect(resp.finished).toBe(false)
    expect(resp.revealDurationMs).toBe(1500)
  })

  it('remis → 0 dla obu (pole obecne, nie pomijane)', () => {
    const resp = resolvePipeline(rps, req(initState(), { p1: 'rock', p2: 'rock' }))
    expect(resp.points).toEqual({ p1: 0, p2: 0 })
    const view = resp.views.find((v) => v.playerId === 'p1')!.view as any
    expect(view.roundWinner).toBeNull()
  })

  it('dojście do target kończy mecz; scores nieujemne', () => {
    const state = initState(['p1', 'p2'], { target: 1 })
    const resp = resolvePipeline(rps, req(state, { p1: 'paper', p2: 'rock' }))
    expect(resp.points).toEqual({ p1: 1, p2: 0 })
    expect(resp.finished).toBe(true) // target=1, p1 osiąga 1
    const next = resp.state as RpsState
    expect(next.scores).toEqual({ p1: 1, p2: 0 })
  })

  it('spóźniony gracz bez prefs dostaje domyślny fallback random (deterministyczny)', () => {
    const state = initState()
    const expectedP2 = rps.defaultMove(state, 'p2')
    const resp = resolvePipeline(rps, req(state, { p1: 'paper' })) // p2 spóźniony → random
    const p2 = (resp.events[0] as any).picks.find((x: any) => x.playerId === 'p2')
    expect(p2.move).toBe(expectedP2)
    expect(p2.defaulted).toBe(true)
  })
})

describe('RPS — target domyślny', () => {
  it('brak target w options → domyślnie 5 (było 2)', () => {
    const state = initState(['p1', 'p2'], {})
    expect(state.target).toBe(5)
  })
})

describe('RPS — N graczy (punktacja parowa)', () => {
  it('3 graczy: rock/rock/scissors → dwaj z rock biją scissors (+1 każdy), remis między sobą → 1,1,0', () => {
    const state = initState(['p1', 'p2', 'p3'])
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'rock', p3: 'scissors' }))
    expect(resp.points).toEqual({ p1: 1, p2: 1, p3: 0 })
    const view = resp.views.find((v) => v.playerId === 'p1')!.view as any
    expect(view.roundWinner).toBeNull() // p1 i p2 remisują na szczycie (+1 obaj)
    expect(view.scores).toEqual({ p1: 1, p2: 1, p3: 0 })
  })

  it('pełny remis (wszyscy to samo) → 0 dla każdego, brak roundWinner', () => {
    const state = initState(['p1', 'p2', 'p3', 'p4'])
    const resp = resolvePipeline(rps, req(state, { p1: 'paper', p2: 'paper', p3: 'paper', p4: 'paper' }))
    expect(resp.points).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 })
    const view = resp.views.find((v) => v.playerId === 'p1')!.view as any
    expect(view.roundWinner).toBeNull()
    expect(resp.finished).toBe(false)
  })

  it('unikalny zwycięzca rundy w grupie N: kamień bije wszystkich nożycowców', () => {
    const state = initState(['p1', 'p2', 'p3'])
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'scissors', p3: 'scissors' }))
    // p1 bije p2 i p3 (+1 każda para) → p1: 2; p2 vs p3 remis → 0, 0
    expect(resp.points).toEqual({ p1: 2, p2: 0, p3: 0 })
    const view = resp.views.find((v) => v.playerId === 'p1')!.view as any
    expect(view.roundWinner).toBe('p1')
  })

  it('spóźniony gracz z fallbackiem paper w gronie N — zastępczy ruch liczy się do punktacji parowej', () => {
    const state = initState(['p1', 'p2', 'p3'], {}, { p3: { data: {}, prefs: { fallbackMove: 'paper' } } })
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'rock' })) // p3 spóźniony → paper
    const p3 = (resp.events[0] as any).picks.find((x: any) => x.playerId === 'p3')
    expect(p3.move).toBe('paper')
    expect(p3.defaulted).toBe(true)
    // paper (p3) bije rock (p1) i rock (p2) → p3: 2; p1 vs p2 remis → 0, 0
    expect(resp.points).toEqual({ p1: 0, p2: 0, p3: 2 })
  })

  it('finished gdy KTOKOLWIEK dobije target, niezależnie który gracz', () => {
    const state = initState(['p1', 'p2', 'p3'], { target: 2 })
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'scissors', p3: 'scissors' }))
    // p1: +2 (bije p2 i p3) → osiąga target=2
    expect(resp.finished).toBe(true)
  })

  it('niezmiennik: roundPoints każdego gracza są nieujemne i ≤ liczby przeciwników (winner-only)', () => {
    const combos: Array<Record<string, RpsMove>> = [
      { p1: 'rock', p2: 'paper', p3: 'scissors' },
      { p1: 'rock', p2: 'rock', p3: 'paper' },
      { p1: 'scissors', p2: 'scissors', p3: 'scissors' },
      { p1: 'rock', p2: 'paper', p3: 'scissors', p4: 'rock' },
    ]
    for (const moves of combos) {
      const ids = Object.keys(moves)
      const state = initState(ids)
      const resp = resolvePipeline(rps, req(state, moves))
      for (const v of Object.values(resp.points)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(ids.length - 1)
      }
    }
  })

  it('view każdego gracza niesie moves wszystkich, roundPoints i roundWinner', () => {
    const state = initState(['p1', 'p2', 'p3'])
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'paper', p3: 'scissors' }))
    for (const v of resp.views) {
      const view = v.view as any
      expect(view.moves).toHaveLength(3)
      expect(Object.keys(view.roundPoints).sort()).toEqual(['p1', 'p2', 'p3'])
      expect(view.scores).toBeDefined()
      expect(view.target).toBe(state.target)
    }
  })
})

describe('RPS — preferencje fallback (playerPrefs.fallbackMove)', () => {
  it('manifest deklaruje playerPrefs.fallbackMove z wartościami i default=random', () => {
    const prefs = (rps.manifest as any).playerPrefs
    expect(prefs).toEqual([
      {
        key: 'fallbackMove',
        type: 'enum',
        values: ['rock', 'paper', 'scissors', 'random'],
        default: 'random',
        label: expect.any(String),
      },
    ])
  })

  it('gracz z prefs fallbackMove=paper spóźniony → składa paper (defaulted:true)', () => {
    const state = initState(['p1', 'p2'], {}, { p2: { data: {}, prefs: { fallbackMove: 'paper' } } })
    expect(state.fallback).toEqual({ p1: 'random', p2: 'paper' })

    const resp = resolvePipeline(rps, req(state, { p1: 'rock' })) // p2 spóźniony → paper
    const p2 = (resp.events[0] as any).picks.find((x: any) => x.playerId === 'p2')
    expect(p2.move).toBe('paper')
    expect(p2.defaulted).toBe(true)
    expect(resp.points).toEqual({ p1: 0, p2: 1 }) // paper bije rock — p2 +1, p1 0
  })

  it('różni gracze z różnym fallbackiem — prefs stosowane per gracz', () => {
    const state = initState(['p1', 'p2'], {}, {
      p1: { data: {}, prefs: { fallbackMove: 'rock' } },
      p2: { data: {}, prefs: { fallbackMove: 'scissors' } },
    })
    expect(rps.defaultMove(state, 'p1')).toBe('rock')
    expect(rps.defaultMove(state, 'p2')).toBe('scissors')
  })

  it('nieznana/nielegalna wartość prefs fallbackMove pada do random', () => {
    const state = initState(['p1', 'p2'], {}, {
      p1: { data: {}, prefs: { fallbackMove: 'lizard' as unknown as string } },
    })
    expect(state.fallback.p1).toBe('random')
  })

  it('fallback random: deterministyczny (dwa wywołania dają ten sam ruch)', () => {
    const state = initState(['p1', 'p2'], {}, {}, 'seed-abc')
    expect(rps.defaultMove(state, 'p1')).toBe(rps.defaultMove(state, 'p1'))
  })

  it('fallback random: deterministyczny po round-tripie przez JSON', () => {
    const state = initState(['p1', 'p2'], {}, {}, 'seed-xyz')
    const stateAfterJson = JSON.parse(JSON.stringify(state)) as RpsState
    expect(rps.defaultMove(stateAfterJson, 'p1')).toBe(rps.defaultMove(state, 'p1'))
    expect(rps.defaultMove(stateAfterJson, 'p2')).toBe(rps.defaultMove(state, 'p2'))
  })

  it('fallback random: różni gracze/rundy mogą dać różne ruchy, zawsze legalne', () => {
    const state = initState(['p1', 'p2', 'p3'], {}, {}, 'seed-multi')
    for (const p of ['p1', 'p2', 'p3']) {
      expect(['rock', 'paper', 'scissors']).toContain(rps.defaultMove(state, p))
    }
  })

  it('seed i fallback przenoszone do stanu następnej rundy', () => {
    const state = initState(['p1', 'p2'], {}, { p1: { data: {}, prefs: { fallbackMove: 'scissors' } } }, 'seed-carry')
    const resp = resolvePipeline(rps, req(state, { p1: 'rock', p2: 'scissors' }))
    const next = resp.state as RpsState
    expect(next.seed).toBe('seed-carry')
    expect(next.fallback).toEqual(state.fallback)
  })
})
