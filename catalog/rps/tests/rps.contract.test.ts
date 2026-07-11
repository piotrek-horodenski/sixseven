import { describe, it, expect } from 'vitest'
import { runContractTests, allPassed, resolvePipeline, ResolveRequest, PlayerData } from 'sixseven-sdk'

import { rps, RpsState } from '../src/rps'

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

describe('RPS — reguły', () => {
  it('kamień bije nożyce → punkt dla gracza', () => {
    const resp = resolvePipeline(rps, req(initState(), { p1: 'rock', p2: 'scissors' }))
    expect(resp.points).toEqual({ p1: 1 })
    expect(resp.finished).toBe(false)
    expect(resp.revealDurationMs).toBe(1500)
  })

  it('remis → brak punktów', () => {
    const resp = resolvePipeline(rps, req(initState(), { p1: 'rock', p2: 'rock' }))
    expect(resp.points).toEqual({})
  })

  it('best-of: dojście do target kończy mecz', () => {
    const state = initState(['p1', 'p2'], { target: 1 })
    const resp = resolvePipeline(rps, req(state, { p1: 'paper', p2: 'rock' }))
    expect(resp.points).toEqual({ p1: 1 })
    expect(resp.finished).toBe(true) // target=1, p1 osiąga 1
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
    expect(resp.points).toEqual({ p2: 1 }) // paper bije rock
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
