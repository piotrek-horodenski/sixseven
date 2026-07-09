import { describe, it, expect } from 'vitest'

import { runContractTests, allPassed, HarnessResult } from '../src/harness'
import { rps, badDeterminism, badSchema } from './fixtures/games'

function byName(results: HarnessResult[], name: string): HarnessResult {
  const r = results.find((x) => x.name === name)
  if (!r) throw new Error(`brak testu: ${name}`)
  return r
}

describe('runContractTests', () => {
  it('poprawny RPS przechodzi wszystkie kontrakt-testy', () => {
    const results = runContractTests(rps, { moves: { p1: 'rock', p2: 'scissors' } })
    expect(allPassed(results)).toBe(true)
  })

  it('łapie niedeterministyczny resolve', () => {
    const results = runContractTests(badDeterminism, { moves: { p1: 'rock', p2: 'scissors' } })
    expect(allPassed(results)).toBe(false)
    expect(byName(results, 'resolve jest deterministyczny').passed).toBe(false)
  })

  it('łapie odpowiedź poza schematem (ujemny revealDurationMs)', () => {
    const results = runContractTests(badSchema, { moves: { p1: 'rock', p2: 'scissors' } })
    expect(allPassed(results)).toBe(false)
    expect(byName(results, 'odpowiedź resolve pasuje do schematu').passed).toBe(false)
  })

  it('domyślny scenariusz (brak ruchów → spóźnieni) też przechodzi dla RPS', () => {
    const results = runContractTests(rps)
    expect(allPassed(results)).toBe(true)
  })

  it('waliduje minimalny planningPhaseMs', () => {
    const fast = { ...rps, manifest: { ...rps.manifest, planningPhaseMs: 500 } }
    const results = runContractTests(fast)
    expect(byName(results, 'manifest.planningPhaseMs ≥ 2000').passed).toBe(false)
  })
})
