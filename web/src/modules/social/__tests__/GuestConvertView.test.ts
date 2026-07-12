import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// Fake klienta socketu gościa — przechwytuje emit `guest:convert`.
const socketMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  call: vi.fn(),
}))

vi.mock('@/composables/useTokenSocket', () => ({
  useTokenSocket: vi.fn(() => socketMock),
}))

import GuestConvertView from '../GuestConvertView.vue'

const GUEST_TOKEN_KEY = 'hydra_guest_token'

const StubSlots = defineComponent({
  inheritAttrs: false,
  setup: (_, { slots }) => () => h('form', [slots.default?.(), slots.errors?.(), slots.buttons?.()]),
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
  RouterLink: defineComponent({ props: ['to'], setup: (_, { slots }) => () => h('a', slots.default?.()) }),
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
}

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(GuestConvertView, { global: { plugins: [pinia], stubs } })
}

describe('GuestConvertView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem(GUEST_TOKEN_KEY, JSON.stringify({ token: 'guest-tok', guestId: 'g1', code: 'ABC234' }))
  })

  afterEach(() => {
    localStorage.removeItem(GUEST_TOKEN_KEY)
  })

  it('pokazuje stan „brak sesji" gdy nie ma tokenu gościa', async () => {
    localStorage.removeItem(GUEST_TOKEN_KEY)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Brak aktywnej sesji gościa')
    // Formularza nie ma → brak inputów
    expect(wrapper.findAll('input')).toHaveLength(0)
  })

  it('przycisk zablokowany dopóki formularz nie jest poprawny', async () => {
    const wrapper = mountView()
    await flushPromises()
    const button = wrapper.find('button')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    // Kliknięcie przy niepoprawnym formularzu nie wysyła komendy
    await button.trigger('click')
    expect(socketMock.call).not.toHaveBeenCalled()
  })

  it('waliduje i wysyła guest:convert przez socket gościa', async () => {
    const wrapper = mountView()
    await flushPromises()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('newbie') // username
    await inputs[1].setValue('newbie@example.com') // email
    await inputs[2].setValue('secret123') // password

    const button = wrapper.find('button')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    await button.trigger('click')

    expect(socketMock.connect).toHaveBeenCalled()
    expect(socketMock.call).toHaveBeenCalledWith('guest:convert', {
      username: 'newbie',
      email: 'newbie@example.com',
      password: 'secret123',
    })
  })

  it('nie wysyła przy niepoprawnym e-mailu', async () => {
    const wrapper = mountView()
    await flushPromises()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('newbie')
    await inputs[1].setValue('not-an-email')
    await inputs[2].setValue('secret123')

    await wrapper.find('button').trigger('click')
    expect(socketMock.call).not.toHaveBeenCalled()
  })
})
