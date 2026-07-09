import { describe, it, expect } from 'vitest'
import { Subscription } from '../../app/subscriptions/subscriptions'

describe('Subscription', () => {
  describe('collections getter', () => {
    it('returns unique collection names from tickets', () => {
      const sub = new Subscription('s1', [
        { collection: 'users', filter: {} },
        { collection: 'messages', filter: {} },
        { collection: 'users', filter: { active: true } },
      ])
      expect(sub.collections).toEqual(['users', 'messages'])
    })

    it('returns empty array when no tickets', () => {
      const sub = new Subscription('s1')
      expect(sub.collections).toEqual([])
    })
  })

  describe('addTickets()', () => {
    it('adds new tickets and returns only newly added ones', () => {
      const sub = new Subscription('s1')
      const added = sub.addTickets([
        { collection: 'users', filter: {} },
        { collection: 'messages', filter: {} },
      ])
      expect(added).toHaveLength(2)
      expect(sub.tickets).toHaveLength(2)
    })

    it('rejects duplicate tickets with same collection and filter', () => {
      const sub = new Subscription('s1', [{ collection: 'users', filter: { active: true } }])
      const added = sub.addTickets([{ collection: 'users', filter: { active: true } }])
      expect(added).toHaveLength(0)
      expect(sub.tickets).toHaveLength(1)
    })

    it('accepts same collection with a different filter as distinct', () => {
      const sub = new Subscription('s1', [{ collection: 'users', filter: { active: true } }])
      const added = sub.addTickets([{ collection: 'users', filter: { active: false } }])
      expect(added).toHaveLength(1)
      expect(sub.tickets).toHaveLength(2)
    })

    it('returns only the tickets that were actually new', () => {
      const sub = new Subscription('s1', [{ collection: 'users', filter: {} }])
      const added = sub.addTickets([
        { collection: 'users', filter: {} },      // duplicate
        { collection: 'messages', filter: {} },   // new
      ])
      expect(added).toHaveLength(1)
      expect(added[0].collection).toBe('messages')
    })
  })
})
