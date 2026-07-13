import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

/**
 * Testy przepływu kolejki szybkiego meczu (kontrakt §4 „Ranked"/§5 WEB) na
 * mockach socketu: join → wpis `waiting` (czas od since, anuluj=queue:leave) →
 * `proposed` (dialog akceptu, queue:accept z proposalId) → `matched` + matchId
 * → games:request-handoff. Stan wpisu przychodzi subskrypcją `queue`
 * (row-level: tylko własne). Asercje widocznych tekstów PO POLSKU.
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

import QuickMatchOverlay from '../QuickMatchOverlay.vue'
import { useQueueStore } from '@/stores/games/queue.store'

/** Symuluje broadcast serwera na sockecie usera (subskrypcje queue/games/rooms). */
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
  UiPopup: defineComponent({
    props: ['show', 'size', 'closable'],
    emits: ['update:show'],
    setup: (props, { slots }) => () =>
      props.show ? h('div', { class: 'stub-popup' }, [slots.title?.(), slots.default?.()]) : null,
  }),
}

/** Wpis własnej kolejki (kształt kontraktu §1). */
function queueEntry(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'rps_me',
    gameId: 'rps',
    userId: 'me',
    elo: 1200,
    since: Date.now() - 5000,
    status: 'waiting',
    updatedAt: Date.now(),
    ...overrides,
  }
}

async function mountOverlay() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(QuickMatchOverlay, { global: { plugins: [pinia], stubs } })
  await flushPromises()
  return wrapper
}

describe('QuickMatchOverlay — przepływ kolejki (4e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subskrybuje kolekcję queue; join wysyła queue:join z gameId', async () => {
    await mountOverlay()
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'queue', filter: {} }],
    })
    // Join odpala kafelek na Home — tu wołamy akcję store (te same mocki).
    const queue = useQueueStore()
    queue.join('rps')
    expect(mockCall).toHaveBeenCalledWith('queue:join', { gameId: 'rps' })
  })

  it('waiting: pokazuje oczekiwanie z czasem od since; anuluj → queue:leave', async () => {
    const wrapper = await mountOverlay()
    fireAll('collection-init', 'queue', [queueEntry()])
    await nextTick()

    expect(wrapper.text()).toContain('Szukam przeciwnika…')
    // Czas liczony od `since` (~5 s w kolejce)
    expect(wrapper.text()).toMatch(/W kolejce \(rps\) od \d+ s\./)

    const cancel = wrapper.findAll('button').find((b) => b.text().includes('Anuluj oczekiwanie'))
    expect(cancel).toBeDefined()
    await cancel!.trigger('click')
    expect(mockCall).toHaveBeenCalledWith('queue:leave', { gameId: 'rps' })
  })

  it('proposed: dialog akceptu z odliczaniem; akcept → queue:accept z proposalId', async () => {
    const wrapper = await mountOverlay()
    fireAll('collection-init', 'queue', [queueEntry()])
    await nextTick()
    fireAll(
      'collection-update',
      'queue',
      queueEntry({ status: 'proposed', proposalId: 'p1', proposalDeadline: Date.now() + 10_000 }),
    )
    await nextTick()

    expect(wrapper.text()).toContain('Mecz znaleziony!')
    expect(wrapper.text()).toContain('Zaakceptuj w ciągu')

    const accept = wrapper.findAll('button').find((b) => b.text().includes('Akceptuj'))
    expect(accept).toBeDefined()
    await accept!.trigger('click')
    expect(mockCall).toHaveBeenCalledWith('queue:accept', { gameId: 'rps', proposalId: 'p1' })
  })

  it('matched: prosi o handoff meczu (games:request-handoff) DOKŁADNIE raz', async () => {
    const wrapper = await mountOverlay()
    fireAll('collection-init', 'queue', [
      queueEntry({ status: 'proposed', proposalId: 'p1', proposalDeadline: Date.now() + 10_000 }),
    ])
    await nextTick()
    fireAll('collection-update', 'queue', queueEntry({ status: 'matched', matchId: 'm9' }))
    await nextTick()

    expect(wrapper.text()).toContain('Przeciwnik gotowy')
    expect(mockCall).toHaveBeenCalledWith('games:request-handoff', { matchId: 'm9' })

    // Kolejny update tego samego wpisu NIE dubluje handoffu (raz per matchId).
    fireAll('collection-update', 'queue', queueEntry({ status: 'matched', matchId: 'm9' }))
    await nextTick()
    const handoffCalls = mockCall.mock.calls.filter((c: any) => c[0] === 'games:request-handoff')
    expect(handoffCalls.length).toBe(1)
  })
})
