import { computed } from 'vue'
import { useGateStore } from '@/stores/gate/gate.store'

export function usePermission() {
  const gate = useGateStore()

  const permissions = computed<string[]>(() => gate.user?.permissions || [])

  function hasPermission(name: string): boolean {
    return permissions.value.includes(name)
  }

  function hasAnyPermission(names: string[]): boolean {
    return names.some(name => permissions.value.includes(name))
  }

  function hasAllPermissions(names: string[]): boolean {
    return names.every(name => permissions.value.includes(name))
  }

  return { permissions, hasPermission, hasAnyPermission, hasAllPermissions }
}
