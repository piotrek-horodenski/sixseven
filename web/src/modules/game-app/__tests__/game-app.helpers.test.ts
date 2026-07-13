import { describe, it, expect } from 'vitest'

import { exitVariantFor, roundOutcomeFor } from '../game-app.helpers'

/**
 * Testy czystych helperów aplikacji gry (fixy z backlogu, kontrakt §4/§5 WEB):
 *  - exitVariantFor: dobór wariantu wyjścia (host lobby / casual / ranked),
 *  - roundOutcomeFor: etykieta rundy z `roundWinner` eventu, NIE ze znaku punktów.
 */
describe('exitVariantFor (fix „wyjście z gry")', () => {
  it('host w lobby → lobby-host (rooms:close)', () => {
    expect(exitVariantFor('lobby', false, true)).toBe('lobby-host')
    // ranked nie zmienia wariantu w lobby (walkower dotyczy meczu w toku)
    expect(exitVariantFor('lobby', true, true)).toBe('lobby-host')
  })

  it('nie-host w lobby → lobby-guest (sama nawigacja)', () => {
    expect(exitVariantFor('lobby', false, false)).toBe('lobby-guest')
  })

  it('mecz casual w toku → casual (bez komendy, defaultMove gra dalej)', () => {
    expect(exitVariantFor('planning', false, false)).toBe('casual')
    expect(exitVariantFor('resolving', false, false)).toBe('casual')
    expect(exitVariantFor('revealing', false, false)).toBe('casual')
    expect(exitVariantFor('paused', false, false)).toBe('casual')
  })

  it('mecz ranked w toku → ranked (games:abandon, walkower)', () => {
    expect(exitVariantFor('planning', true, false)).toBe('ranked')
    expect(exitVariantFor('resolving', true, true)).toBe('ranked')
    expect(exitVariantFor('paused', true, false)).toBe('ranked')
  })

  it('finished/cancelled/brak fazy → null (goBack mają własne)', () => {
    expect(exitVariantFor('finished', true, true)).toBeNull()
    expect(exitVariantFor('cancelled', false, false)).toBeNull()
    expect(exitVariantFor(undefined, false, false)).toBeNull()
  })
})

describe('roundOutcomeFor (fix outcomeFor)', () => {
  it('unikalny lider rundy → win dla niego, lose dla pozostałych', () => {
    expect(roundOutcomeFor('alice', 'alice')).toBe('win')
    expect(roundOutcomeFor('alice', 'bob')).toBe('lose')
    expect(roundOutcomeFor('alice', 'carol')).toBe('lose')
  })

  it('remis na szczycie (roundWinner === null) → draw dla wszystkich', () => {
    expect(roundOutcomeFor(null, 'alice')).toBe('draw')
    expect(roundOutcomeFor(undefined, 'bob')).toBe('draw')
  })

  it('wynik NIE zależy od znaku punktów — sam identyfikator zwycięzcy', () => {
    // Suma parowa bywa ujemna także u „niewygranych" — etykieta ma iść z winner.
    expect(roundOutcomeFor('bob', 'bob')).toBe('win')
    expect(roundOutcomeFor('bob', 'alice')).toBe('lose')
  })
})
