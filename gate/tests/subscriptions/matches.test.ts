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
})
