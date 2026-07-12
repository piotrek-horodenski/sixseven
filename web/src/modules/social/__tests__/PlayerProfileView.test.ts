import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    user: { _id: 'me', permissions: [] },
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import PlayerProfileView from '../PlayerProfileView.vue'

function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}
function ack(event: string, payload: any) {
  const handler = mockOn.mock.calls.find((c: any) => c[0] === event)?.[1]
  handler?.(payload)
}

const stubs: Record<string, any> = {
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
}

const PROFILE = {
  userId: 'bob',
  display: 'Bob the Great',
  history: {
    games: [{ gameId: 'rps', played: 5, wins: 3, losses: 1, draws: 1 }],
    recent: [{ matchId: 'm1', gameId: 'rps', finishedAt: 1_700_000_000_000, result: 'win', score: 5 }],
  },
}

async function mountProfile(userId = 'bob') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/u/:userId', name: 'profile-public', component: PlayerProfileView }],
  })
  router.push(`/u/${userId}`)
  await router.isReady()
  const wrapper = mount(PlayerProfileView, {
    global: { plugins: [pinia, router], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PlayerProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('woła profile:get z userId z trasy i subskrybuje annotations', async () => {
    await mountProfile('bob')
    expect(mockCall).toHaveBeenCalledWith('profile:get', { userId: 'bob' })
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'annotations', filter: { playerId: 'bob' } }],
    })
  })

  it('renderuje display i agregat win/loss/draw po profile:get-complete', async () => {
    const wrapper = await mountProfile('bob')
    ack('profile:get-complete', { profile: PROFILE })
    await nextTick()
    expect(wrapper.text()).toContain('Bob the Great')
    expect(wrapper.text()).toContain('rps')
    // wins=3, losses=1, draws=1 z agregatu
    const table = wrapper.find('.player-profile__table')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('3')
  })

  it('renderuje odznaki z subskrypcji annotations', async () => {
    const wrapper = await mountProfile('bob')
    ack('profile:get-complete', { profile: PROFILE })
    fireAll('collection-init', 'annotations', [
      { _id: 'an1', playerId: 'bob', gameId: 'rps', badgeId: 'first_win', sentiment: 'positive', earnedAt: 1 },
    ])
    await nextTick()
    expect(wrapper.text()).toContain('first_win')
  })

  it('pokazuje błąd po profile:get-error', async () => {
    const wrapper = await mountProfile('bob')
    ack('profile:get-error', { message: 'not found' })
    await nextTick()
    expect(wrapper.text()).toContain('not found')
  })
})
