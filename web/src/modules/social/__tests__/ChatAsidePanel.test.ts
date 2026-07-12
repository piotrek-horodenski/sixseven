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

import ChatAsidePanel from '../ChatAsidePanel.vue'

function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}

const StubSlots = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.errors?.(), slots.buttons?.()])
  },
})

const stubs: Record<string, any> = {
  UiForm: StubSlots,
  UiMessage: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UiButton: defineComponent({
    props: ['disabled', 'loading'],
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
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  })
  return router
}

async function mountPanel(props: Record<string, unknown> = { scope: 'room', scopeId: 'r1' }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  router.push('/')
  await router.isReady()
  const wrapper = mount(ChatAsidePanel, {
    props,
    global: { plugins: [pinia, router], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('ChatAsidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subskrybuje messages dla podanego zakresu na mount', async () => {
    await mountPanel({ scope: 'room', scopeId: 'r1' })
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'messages', filter: { scope: 'room', scopeId: 'r1' } }],
    })
  })

  it('renderuje pusty stan bez zakresu', async () => {
    const wrapper = await mountPanel({})
    expect(wrapper.text()).toContain('Czat niedostępny w tym widoku.')
  })

  it('renderuje wiadomości z subskrypcji', async () => {
    const wrapper = await mountPanel({ scope: 'room', scopeId: 'r1' })
    fireAll('collection-init', 'messages', [
      { _id: 'a', scope: 'room', scopeId: 'r1', authorId: 'bob', authorNick: 'Bob', text: 'Cześć', ts: 10 },
    ])
    await nextTick()
    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.text()).toContain('Cześć')
  })

  it('wysyła wiadomość przez chat:send po kliknięciu', async () => {
    const wrapper = await mountPanel({ scope: 'room', scopeId: 'r1' })
    const input = wrapper.find('input')
    await input.setValue('hej')
    const button = wrapper.find('button')
    await button.trigger('click')
    expect(mockCall).toHaveBeenCalledWith('chat:send', { scope: 'room', scopeId: 'r1', text: 'hej' })
  })
})
