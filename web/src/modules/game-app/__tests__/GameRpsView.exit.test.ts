import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

/**
 * Testy FIXU „wyjście z /game/rps" (kontrakt §4 „Fixy" pkt 1, §5 WEB):
 * trwały przycisk + 3 warianty modala i komend:
 *  - host w lobby → modal potwierdzenia → `rooms:close { roomId }`,
 *  - casual w toku → modal informacyjny → nawigacja BEZ komendy,
 *  - ranked w toku → modal „walkower" → `games:abandon` socketem TOKENU MECZU
 *    (client.abandon z useMatchClient — NIE socketem usera).
 * Asercje widocznych tekstów PO POLSKU (locale pl z vitest.setup).
 */

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    user: { _id: 'me', permissions: [] },
    isAuthenticated: true,
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

// Klient meczu (socket tokenu meczu) — sterowalny mock zamiast wymiany handoffu.
vi.mock('@/composables/useMatchClient', async () => {
  const { ref, computed } = await import('vue')
  const match = ref<any>(null)
  const status = ref<'idle' | 'exchanging' | 'ready' | 'error'>('ready')
  const playerId = ref<string | null>('me')
  const players = computed<string[]>(() => {
    const m = match.value
    return m ? [...(m.players ?? []), ...(m.guestIds ?? [])] : []
  })
  const opponents = computed(() => players.value.filter((id: string) => id !== playerId.value))
  const client = {
    status,
    error: ref<string | null>(null),
    matchId: ref<string | null>('m1'),
    playerId,
    gameId: ref<string | null>('rps'),
    matches: ref<any[]>([]),
    views: ref<any[]>([]),
    rejected: ref(false),
    abandonAcked: ref(false),
    match,
    latestView: ref<any>(undefined),
    players,
    opponents,
    opponentId: computed(() => opponents.value[0] ?? null),
    start: vi.fn(),
    startMatch: vi.fn(),
    submitMove: vi.fn(),
    revealDone: vi.fn(),
    abandon: vi.fn(),
    cleanup: vi.fn(),
  }
  return { useMatchClient: () => client, __clientMock: client }
})

import GameRpsView from '../GameRpsView.vue'
import * as matchClientModule from '@/composables/useMatchClient'

const client: any = (matchClientModule as any).__clientMock

/** Symuluje broadcast serwera na sockecie usera (subskrypcja rooms). */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}

const stubs: Record<string, any> = {
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
  RpsHand: defineComponent({ setup: () => () => h('div', 'hand') }),
  RpsIcon: defineComponent({ setup: () => () => h('i') }),
  ChatAsidePanel: defineComponent({ setup: () => () => h('div', 'chat') }),
  UiMessage: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UiButton: defineComponent({
    props: ['disabled', 'loading', 'icon'],
    emits: ['click'],
    setup: (props, { slots, emit }) => () =>
      h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()),
  }),
  UiPopup: defineComponent({
    props: ['show', 'size', 'outsideClose', 'closable'],
    emits: ['update:show'],
    setup: (props, { slots }) => () =>
      props.show ? h('div', { class: 'stub-popup' }, [slots.title?.(), slots.default?.()]) : null,
  }),
}

/** Bazowy dokument meczu — nadpisywany per scenariusz. */
function matchDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'm1',
    gameId: 'rps',
    players: ['me', 'bob'],
    guestIds: [],
    nicks: { me: 'Ja', bob: 'Bob' },
    roomCode: 'ABC123',
    capacity: 2,
    ranked: false,
    phase: 'planning',
    round: 1,
    deadline: Date.now() + 10_000,
    ready: {},
    lobbyReady: {},
    score: { me: 0, bob: 0 },
    options: { target: 5 },
    endReason: null,
    ...overrides,
  }
}

async function mountGame(doc: Record<string, unknown> | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/game/rps', component: GameRpsView }],
  })
  router.push('/game/rps?handoff=abc&return=/')
  await router.isReady()
  client.match.value = doc
  const wrapper = mount(GameRpsView, { global: { plugins: [pinia, router], stubs } })
  await flushPromises()
  return wrapper
}

async function openExitModal(wrapper: any) {
  const exit = wrapper.find('.game-app__exit')
  expect(exit.exists()).toBe(true)
  await exit.trigger('click')
  await nextTick()
}

/** Przycisk potwierdzenia = drugi w akcjach modala (pierwszy to „Zostań w grze"). */
async function confirmModal(wrapper: any) {
  const buttons = wrapper.findAll('.game-exit__actions button')
  expect(buttons.length).toBe(2)
  await buttons[1].trigger('click')
  await nextTick()
}

describe('GameRpsView — trwały przycisk wyjścia (3 warianty)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.match.value = null
    client.status.value = 'ready'
    client.abandonAcked.value = false
    client.error.value = null
  })

  it('host w lobby: modal potwierdzenia → rooms:close z roomId', async () => {
    const wrapper = await mountGame(
      matchDoc({ phase: 'lobby', players: ['me'], deadline: null }),
    )
    // Pokój tego meczu z subskrypcji rooms — jestem hostem.
    fireAll('collection-init', 'rooms', [
      { _id: 'r1', matchId: 'm1', hostId: 'me', code: 'ABC123', status: 'open', members: [{ id: 'me' }] },
    ])
    await nextTick()

    await openExitModal(wrapper)
    expect(wrapper.text()).toContain('Zamknąć grę?')
    expect(wrapper.text()).toContain('Jesteś hostem')

    await confirmModal(wrapper)
    expect(mockCall).toHaveBeenCalledWith('rooms:close', { roomId: 'r1' })
    expect(client.abandon).not.toHaveBeenCalled()
  })

  it('casual w toku: modal informacyjny → nawigacja BEZ komendy', async () => {
    const wrapper = await mountGame(matchDoc({ ranked: false, phase: 'planning' }))

    await openExitModal(wrapper)
    expect(wrapper.text()).toContain('Wyjść z meczu?')
    expect(wrapper.text()).toContain('Mecz będzie kontynuowany')

    await confirmModal(wrapper)
    // Wyjście z casual NIE wysyła komend — defaultMove gra dalej.
    expect(client.abandon).not.toHaveBeenCalled()
    const calledEvents = mockCall.mock.calls.map((c: any) => c[0])
    expect(calledEvents).not.toContain('rooms:close')
    expect(calledEvents).not.toContain('games:abandon')
  })

  it('ranked w toku: badge + modal „walkower" → games:abandon socketem meczu', async () => {
    const wrapper = await mountGame(matchDoc({ ranked: true, phase: 'planning' }))

    // Badge meczu rankingowego (4e)
    expect(wrapper.find('.game-app__ranked').text()).toContain('Rankingowy')

    await openExitModal(wrapper)
    expect(wrapper.text()).toContain('Poddać mecz rankingowy?')
    expect(wrapper.text()).toContain('walkower')

    await confirmModal(wrapper)
    // Komenda idzie socketem TOKENU MECZU (client.abandon), NIE socketem usera.
    expect(client.abandon).toHaveBeenCalledTimes(1)
    const calledEvents = mockCall.mock.calls.map((c: any) => c[0])
    expect(calledEvents).not.toContain('games:abandon')
  })

  it('finished: brak trwałego przycisku (goBack ma własny afordans)', async () => {
    const wrapper = await mountGame(matchDoc({ phase: 'finished', score: { me: 5, bob: 2 } }))
    expect(wrapper.find('.game-app__exit').exists()).toBe(false)
  })
})
