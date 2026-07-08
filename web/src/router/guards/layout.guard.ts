import { type RouteLocation } from 'vue-router'

import { useLayoutStore } from '@/stores/layout/layout.store'

export const LayoutGuard = async (to: RouteLocation, from: RouteLocation) => {
  const { onRouteChange } = useLayoutStore()
  const result = await onRouteChange(to, from)

  return result
}
