import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

const mockCall = vi.fn()

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
import { useProfileMenu } from '../useProfileMenu'

// Wrapper component to provide setup lifecycle hooks
const TestComponent = defineComponent({
  setup() {
    return useProfileMenu()
  },
  template: '<div></div>',
})

describe('useProfileMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns Guest when no user', () => {
    const wrapper = mount(TestComponent)
    expect(wrapper.vm.displayName).toBe('Gość')
  })

  it('returns username when no profile display', () => {
    const gate = useGateStore()
    gate.user = { username: 'alice' }

    const wrapper = mount(TestComponent)
    expect(wrapper.vm.displayName).toBe('alice')
  })

  it('returns profile display name when available', () => {
    const gate = useGateStore()
    gate.user = { username: 'alice', profile: { display: 'Alice W.' } }

    const wrapper = mount(TestComponent)
    expect(wrapper.vm.displayName).toBe('Alice W.')
  })

  it('toggleProfile flips the open state', () => {
    const wrapper = mount(TestComponent)

    expect(wrapper.vm.profileOpen).toBe(false)
    wrapper.vm.toggleProfile()
    expect(wrapper.vm.profileOpen).toBe(true)
    wrapper.vm.toggleProfile()
    expect(wrapper.vm.profileOpen).toBe(false)
  })

  it('logout sets loading, closes menu, and calls gate', () => {
    const gate = useGateStore()
    gate.call = mockCall
    const wrapper = mount(TestComponent)

    wrapper.vm.profileOpen = true
    wrapper.vm.logout()

    expect(wrapper.vm.logoutLoading).toBe(true)
    expect(wrapper.vm.profileOpen).toBe(false)
    expect(mockCall).toHaveBeenCalledWith('logout', {})
  })

  it('registers click outside listener on mount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    mount(TestComponent)
    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function))
    addSpy.mockRestore()
  })

  it('removes click outside listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(TestComponent)
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function))
    removeSpy.mockRestore()
  })
})
