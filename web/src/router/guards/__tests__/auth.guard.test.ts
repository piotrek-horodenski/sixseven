import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

import { useGateStore } from '@/stores/gate/gate.store'
import { AuthGuard } from '../auth.guard'

function makeRoute(overrides: any = {}) {
  return {
    path: '/',
    name: 'home',
    matched: [],
    meta: {},
    params: {},
    query: {},
    hash: '',
    fullPath: '/',
    redirectedFrom: undefined,
    ...overrides,
  }
}

describe('AuthGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('allows public route when not authenticated', async () => {
    const result = await AuthGuard(makeRoute({ meta: { public: true }, path: '/login' }))
    expect(result).toBe(true)
  })

  it('redirects authenticated user away from public route', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true

    const result = await AuthGuard(makeRoute({ meta: { public: true }, path: '/login' }))
    expect(result).toBe('/')
  })

  it('redirects to /login when not authenticated on protected route', async () => {
    const result = await AuthGuard(makeRoute({ path: '/dashboard' }))
    expect(result).toBe('/login')
  })

  it('allows access to protected route with no permission requirement', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true
    gate.user = { permissions: [] }

    const result = await AuthGuard(makeRoute({ path: '/dashboard', matched: [] }))
    expect(result).toBe(true)
  })

  it('allows access when user has required permission', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true
    gate.user = { permissions: ['manage-users'] }

    const route = makeRoute({
      path: '/admin/users',
      matched: [{ meta: { requiredPermission: 'manage-users' }, components: {} }],
    })

    const result = await AuthGuard(route)
    expect(result).toBe(true)
  })

  it('redirects to / when user lacks required permission', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true
    gate.user = { permissions: ['access-images'] }

    const route = makeRoute({
      path: '/admin/users',
      matched: [{ meta: { requiredPermission: 'manage-users' }, components: {} }],
    })

    const result = await AuthGuard(route)
    expect(result).toBe('/')
  })

  it('collects permissions from nested matched routes', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true
    gate.user = { permissions: ['view-admin', 'manage-users'] }

    const route = makeRoute({
      path: '/admin/users',
      matched: [
        { meta: { requiredPermission: 'view-admin' }, components: {} },
        { meta: { requiredPermission: 'manage-users' }, components: {} },
      ],
    })

    const result = await AuthGuard(route)
    expect(result).toBe(true)
  })

  it('rejects when missing one of multiple required permissions', async () => {
    const gate = useGateStore()
    gate.isAuthenticated = true
    gate.user = { permissions: ['view-admin'] }

    const route = makeRoute({
      path: '/admin/users',
      matched: [
        { meta: { requiredPermission: 'view-admin' }, components: {} },
        { meta: { requiredPermission: 'manage-users' }, components: {} },
      ],
    })

    const result = await AuthGuard(route)
    expect(result).toBe('/')
  })
})
