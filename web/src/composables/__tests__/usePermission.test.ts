import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGateStore } from '@/stores/gate/gate.store'
import { usePermission } from '../usePermission'

describe('usePermission', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns empty permissions when user is null', () => {
    const { permissions } = usePermission()
    expect(permissions.value).toEqual([])
  })

  it('returns user permissions when user is set', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users', 'access-images'] }

    const { permissions } = usePermission()
    expect(permissions.value).toEqual(['manage-users', 'access-images'])
  })

  it('hasPermission returns true for existing permission', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users'] }

    const { hasPermission } = usePermission()
    expect(hasPermission('manage-users')).toBe(true)
  })

  it('hasPermission returns false for missing permission', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users'] }

    const { hasPermission } = usePermission()
    expect(hasPermission('access-images')).toBe(false)
  })

  it('hasAnyPermission returns true if any match', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users'] }

    const { hasAnyPermission } = usePermission()
    expect(hasAnyPermission(['manage-users', 'access-images'])).toBe(true)
  })

  it('hasAnyPermission returns false if none match', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-roles'] }

    const { hasAnyPermission } = usePermission()
    expect(hasAnyPermission(['manage-users', 'access-images'])).toBe(false)
  })

  it('hasAllPermissions returns true when all present', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users', 'access-images', 'manage-roles'] }

    const { hasAllPermissions } = usePermission()
    expect(hasAllPermissions(['manage-users', 'access-images'])).toBe(true)
  })

  it('hasAllPermissions returns false when one missing', () => {
    const gate = useGateStore()
    gate.user = { permissions: ['manage-users'] }

    const { hasAllPermissions } = usePermission()
    expect(hasAllPermissions(['manage-users', 'access-images'])).toBe(false)
  })
})
