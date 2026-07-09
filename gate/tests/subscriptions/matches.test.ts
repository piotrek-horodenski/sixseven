import { describe, it, expect } from 'vitest'
import { SubscriptionsManager } from '../../app/subscriptions/subscriptions'

describe('SubscriptionsManager.matches()', () => {
  const manager = new SubscriptionsManager()

  it('empty filter matches any document', () => {
    expect(manager.matches({ name: 'alice', active: true }, {})).toBe(true)
    expect(manager.matches({}, {})).toBe(true)
  })

  it('single-field filter matches the correct document', () => {
    expect(manager.matches({ name: 'alice' }, { name: 'alice' })).toBe(true)
    expect(manager.matches({ name: 'bob' }, { name: 'alice' })).toBe(false)
  })

  it('multi-field filter requires all fields to match', () => {
    expect(manager.matches({ name: 'alice', active: true }, { name: 'alice', active: true })).toBe(true)
    expect(manager.matches({ name: 'alice', active: false }, { name: 'alice', active: true })).toBe(false)
  })

  it('non-matching document returns false', () => {
    expect(manager.matches({ name: 'bob', score: 5 }, { name: 'alice' })).toBe(false)
  })

  // KRYTYCZNE (ETAP1 „do zweryfikowania"): row-level security opiera się na
  // mergeFilters() sklejającym filtr serwera z filtrem klienta przez $and.
  // Jeśli matcher change-streamów nie obsłuży $and, filtrowanie po cichu
  // przestaje działać. Te testy blokują regres.
  describe('$and (row-level merge)', () => {
    it('matches only when both branches are satisfied', () => {
      const filter = { $and: [{ playerId: 'me' }, { round: 1 }] }
      expect(manager.matches({ playerId: 'me', round: 1 }, filter)).toBe(true)
      expect(manager.matches({ playerId: 'me', round: 2 }, filter)).toBe(false)
      expect(manager.matches({ playerId: 'other', round: 1 }, filter)).toBe(false)
    })

    it('client cannot widen scope: policy AND client contradiction never matches', () => {
      // Polityka wymusza playerId=me; klient próbuje podejrzeć cudzy dokument.
      const filter = { $and: [{ playerId: 'me' }, { playerId: 'other' }] }
      expect(manager.matches({ playerId: 'me', round: 1 }, filter)).toBe(false)
      expect(manager.matches({ playerId: 'other', round: 1 }, filter)).toBe(false)
    })
  })
})
