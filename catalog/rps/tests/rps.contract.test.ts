import { describe, it, expect } from 'vitest'
import { runContractTests, allPassed, resolvePipeline, ResolveRequest } from 'sixseven-sdk'

import { rps, RpsState } from '../src/rps'

function initState(playerIds = ['p1', 'p2'], options: Record<string, unknown> = {}): RpsState {
  return rps.init({ playerIds, seed: 's', playerData: {}, options })
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

  it('spóźniony gracz dostaje kamień (defaultMove)', () => {
    const resp = resolvePipeline(rps, req(initState(), { p1: 'paper' })) // p2 spóźniony → rock
    expect(resp.points).toEqual({ p1: 1 }) // paper bije rock
    const p2 = (resp.events[0] as any).picks.find((x: any) => x.playerId === 'p2')
    expect(p2.move).toBe('rock')
    expect(p2.defaulted).toBe(true)
  })
})
