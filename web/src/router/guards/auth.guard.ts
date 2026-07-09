import { type RouteLocationNormalized } from 'vue-router'

import { useGateStore } from '@/stores/gate/gate.store'

function waitForUser(gate: ReturnType<typeof useGateStore>, timeout = 5000): Promise<boolean> {
  // User data already available
  if (gate.user) return Promise.resolve(true)

  // No token means no session to wait for
  if (!gate.authToken) return Promise.resolve(false)

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unwatch()
      resolve(false)
    }, timeout)

    const unwatch = gate.$subscribe((_mutation, state) => {
      if (state.user) {
        clearTimeout(timer)
        unwatch()
        resolve(true)
      }
    })
  })
}

function getRequiredPermissions(to: RouteLocationNormalized): string[] {
  const permissions: string[] = []
  for (const record of to.matched) {
    const perm = record.meta?.requiredPermission as string | undefined
    if (perm) permissions.push(perm)
  }
  return permissions
}

export const AuthGuard = async (to: RouteLocationNormalized) => {
  const gate = useGateStore()

  // Open routes (room link `/r/:code`, standalone game app `/game/rps`) are
  // reachable by everyone — logged-in AND anonymous — without any redirect.
  // (`public` alone bounces authenticated users to '/', which would break a
  // logged-in user opening a shared room link or the match app.)
  if (to.meta?.open) {
    return true
  }

  // Public routes (login, register) don't need auth
  if (to.meta?.public) {
    if (gate.isAuthenticated) return '/'
    return true
  }

  // All other routes require authentication
  if (!gate.isAuthenticated) {
    return '/login'
  }

  // Collect permissions from all matched routes (parent + children)
  const requiredPermissions = getRequiredPermissions(to)

  // No permission requirements — allow
  if (!requiredPermissions.length) {
    return true
  }

  // Wait for user data if we have a token but user hasn't loaded yet
  if (!gate.user) {
    const hasUser = await waitForUser(gate)
    if (!hasUser) {
      gate.resetUser()
      return '/login'
    }
  }

  // Check all required permissions
  const userPermissions: string[] = gate.user?.permissions || []
  for (const perm of requiredPermissions) {
    if (!userPermissions.includes(perm)) {
      return '/'
    }
  }

  return true
}
