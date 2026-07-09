import { describe, it, expect } from 'vitest'
import {
  getPolicy,
  mergeFilters,
  sensitiveFields,
  collectionPolicies,
} from '../../app/subscriptions/policies'

describe('subscription policies', () => {
  describe('getPolicy — default-deny', () => {
    it('returns a policy for registered collections', () => {
      expect(getPolicy('users')).toBeDefined()
      expect(getPolicy('color-presets')).toBeDefined()
      expect(getPolicy('matches')).toBeDefined()
      expect(getPolicy('match_views')).toBeDefined()
    })

    it('returns undefined for private games collections (never exposed by gate)', () => {
      expect(getPolicy('moves')).toBeUndefined()
      expect(getPolicy('match_states')).toBeUndefined()
      expect(getPolicy('resolve_log')).toBeUndefined()
      expect(getPolicy('player_memory')).toBeUndefined()
      expect(getPolicy('registrations')).toBeUndefined()
    })

    it('returns undefined for any unknown collection', () => {
      expect(getPolicy('whatever')).toBeUndefined()
    })
  })

  describe('row-level filters', () => {
    it('matches scopes to participation (players contains user)', () => {
      const f = collectionPolicies.matches.filter!({ _id: 'u1' })
      expect(f).toEqual({ players: 'u1' })
    })

    it('match_views scopes to the current player', () => {
      const f = collectionPolicies.match_views.filter!({ _id: 'u1' })
      expect(f).toEqual({ playerId: 'u1' })
    })

    it('queue scopes to the current user', () => {
      const f = collectionPolicies.queue.filter!({ _id: 'u1' })
      expect(f).toEqual({ userId: 'u1' })
    })
  })

  describe('mergeFilters — $and combination', () => {
    it('uses the policy filter when client sends none', () => {
      expect(mergeFilters({ playerId: 'u1' } as any, undefined)).toEqual({ playerId: 'u1' })
      expect(mergeFilters({ playerId: 'u1' } as any, {} as any)).toEqual({ playerId: 'u1' })
    })

    it('uses the client filter when policy has none', () => {
      expect(mergeFilters(undefined, { active: true } as any)).toEqual({ active: true })
    })

    it('ANDs both so the client cannot widen past the policy', () => {
      const merged = mergeFilters({ playerId: 'self' } as any, { playerId: 'victim' } as any)
      expect(merged).toEqual({ $and: [{ playerId: 'self' }, { playerId: 'victim' }] })
    })

    it('returns match-all only when neither side constrains', () => {
      expect(mergeFilters(undefined, undefined)).toEqual({})
    })
  })

  describe('sensitiveFields', () => {
    it('derives from policies and strips password/token on users', () => {
      expect(sensitiveFields.users).toEqual(['password', 'token'])
    })

    it('has no entry for collections without sanitize', () => {
      expect(sensitiveFields['color-presets']).toBeUndefined()
    })
  })
})
