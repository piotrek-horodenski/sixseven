import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

/**
 * Testy katalogu data-driven w /new (kontrakt §4/§5 WEB): lista gier
 * z subskrypcji `games` (builtin + published), etykieta „UI poza platformą"
 * dla gier zewnętrznych, gry `registered` NIE pojawiają się w wyborze.
 * Asercje widocznych tekstów PO POLSKU (locale pl z vitest.setup).
 */

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    user: { _id: 'me', permissions: [], username: 'ja', profile: { display: 'Ja' } },
    isAuthenticated: true,
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import CreateGameView from '../CreateGameView.vue'

/** Symuluje broadcast serwera na sockecie usera (subskrypcje rooms/games). */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}

const stubs: Record<string, any> = {
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
  UiMessage: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UiButton: defineComponent({
    props: ['disabled', 'loading', 'icon'],
    emits: ['click'],
    setup: (props, { slots, emit }) => () =>
      h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()),
  }),
  UiInput: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup: (props, { emit }) => () =>
      h('input', {
        value: props.modelValue,
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      }),
  }),
  ExternalGameWarning: defineComponent({ setup: () => () => null }),
}

/** Dokumenty katalogu `games` (kształt kontraktu §1). */
const CATALOG = [
  {
    _id: 'rps',
    name: 'Papier, kamień, nożyce',
    builtin: true,
    status: 'published',
    devAccountId: null,
    uiUrl: null,
    rankedEligible: true,
    manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 8, planningPhaseMs: 10_000 },
  },
  {
    _id: 'wojna-kart',
    name: 'Wojna kart',
    builtin: false,
    status: 'published',
    devAccountId: 'dev1',
    uiUrl: 'https://gry.example.com/wojna',
    rankedEligible: false,
    manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 4, planningPhaseMs: 5000 },
  },
  {
    _id: 'w-budowie',
    name: 'Jeszcze w budowie',
    builtin: false,
    status: 'registered',
    devAccountId: 'me',
    uiUrl: 'https://gry.example.com/wip',
    rankedEligible: false,
    manifest: { version: '0.1.0', minPlayers: 2, maxPlayers: 2, planningPhaseMs: 5000 },
  },
]

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(CreateGameView, { global: { plugins: [pinia], stubs } })
  await flushPromises()
  fireAll('collection-init', 'games', CATALOG)
  await nextTick()
  return wrapper
}

describe('CreateGameView — katalog data-driven (4d)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subskrybuje kolekcję games (katalog)', async () => {
    await mountView()
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'games', filter: {} }],
    })
  })

  it('renderuje builtin + opublikowane zewnętrzne; registered pomija', async () => {
    const wrapper = await mountView()
    const options = wrapper.findAll('.create-game__option')
    expect(options.length).toBe(2)
    // Builtin pierwsze (sortowanie katalogu)
    expect(options[0].text()).toContain('Papier, kamień, nożyce')
    expect(options[1].text()).toContain('Wojna kart')
    expect(wrapper.text()).not.toContain('Jeszcze w budowie')
  })

  it('gra zewnętrzna dostaje etykietę „UI poza platformą", builtin nie', async () => {
    const wrapper = await mountView()
    const badges = wrapper.findAll('.create-game__ext-badge')
    expect(badges.length).toBe(1)
    expect(badges[0].text()).toBe('UI poza platformą')
    const options = wrapper.findAll('.create-game__option')
    expect(options[0].find('.create-game__ext-badge').exists()).toBe(false)
    expect(options[1].find('.create-game__ext-badge').exists()).toBe(true)
  })

  it('wybór gry zewnętrznej i „Utwórz" → rooms:create z jej gameId', async () => {
    const wrapper = await mountView()
    const options = wrapper.findAll('.create-game__option')
    await options[1].trigger('click')
    await nextTick()

    const submit = wrapper.findAll('button').find((b) => b.text().includes('Utwórz'))
    expect(submit).toBeDefined()
    await submit!.trigger('click')

    const createCall = mockCall.mock.calls.find((c: any) => c[0] === 'rooms:create')
    expect(createCall).toBeDefined()
    expect(createCall![1]).toMatchObject({ gameId: 'wojna-kart' })
  })
})
