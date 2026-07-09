import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGateStore } from '@/stores/gate/gate.store'

export function useProfileMenu() {
  const gate = useGateStore()
  const profileOpen = ref(false)
  const profileMenuRef = ref<HTMLElement | null>(null)
  const logoutLoading = ref(false)

  const displayName = computed(() => {
    return gate.user?.profile?.display || gate.user?.username || 'Guest'
  })

  function toggleProfile() {
    profileOpen.value = !profileOpen.value
  }

  function handleClickOutside(e: MouseEvent) {
    if (profileMenuRef.value && !profileMenuRef.value.contains(e.target as Node)) {
      profileOpen.value = false
    }
  }

  function logout() {
    logoutLoading.value = true
    profileOpen.value = false
    gate.call('logout', {})
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  return {
    profileOpen,
    profileMenuRef,
    logoutLoading,
    displayName,
    toggleProfile,
    logout,
  }
}
