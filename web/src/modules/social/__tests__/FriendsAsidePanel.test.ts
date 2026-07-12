import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

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

import FriendsAsidePanel from '../FriendsAsidePanel.vue'

/** Symuluje broadcast serwera na wszystkie zarejestrowane handlery eventu. */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}

function friendship(x: string, y: string, status: 'invited' | 'accepted', invitedBy: string, id = `${x}_${y}`) {
  const [a, b] = x < y ? [x, y] : [y, x]
  return { _id: id, a, b, status, invitedBy }
}
function presence(userId: string, status: 'online' | 'lobby' | 'match', currentMatchId: string | null = null) {
  return { _id: `p_${userId}`, userId, status, currentMatchId, visibleTo: ['me'] }
}

const StubComponent = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const globalStubs: Record<string, any> = {
  UiButton: defineComponent({
    inheritAttrs: false,
    props: ['loading', 'disabled', 'icon', 'type'],
    emits: ['click'],
    setup(props, { slots, emit }) {
      return () => h('button', {
        disabled: props.disabled || props.loading,
        onClick: () => emit('click'),
      }, slots.default?.())
    },
  }),
  UiInput: defineComponent({
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      return () => h('label', { class: 'ui-input' }, [
        slots.default?.(),
        h('input', {
          value: props.modelValue,
          placeholder: props.placeholder,
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
        }),
      ])
    },
  }),
  UiSwitch: StubComponent,
  fa: defineComponent({
    props: ['icon'],
    setup(props) {
      return () => h('i', { class: `fa-${props.icon}` })
    },
  }),
}

let pinia: ReturnType<typeof createPinia>

function mountPanel() {
  return mount(FriendsAsidePanel, {
    global: {
      plugins: [pinia],
      stubs: globalStubs,
    },
  })
}

describe('FriendsAsidePanel', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it('subskrybuje kolekcje po zamontowaniu (init)', () => {
    mountPanel()
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'friendships', filter: {} }],
    })
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'presence', filter: {} }],
    })
  })

  it('pokazuje pusty stan bez znajomych i zaproszeń', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.friends-panel__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nie masz jeszcze znajomych')
  })

  it('renderuje listę znajomych ze statusem obecności', async () => {
    const wrapper = mountPanel()
    fireAll('collection-init', 'friendships', [
      friendship('me', 'bob', 'accepted', 'me', 'f_bob'),
      friendship('me', 'ann', 'accepted', 'ann', 'f_ann'),
    ])
    fireAll('collection-init', 'presence', [presence('bob', 'match', 'm1')])
    await nextTick()

    const rows = wrapper.findAll('.friend-row')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('bob')
    expect(wrapper.text()).toContain('ann')
    // bob w meczu → status „W grze", ann bez presence → „Niedostępny"
    expect(wrapper.text()).toContain('W grze')
    expect(wrapper.text()).toContain('Niedostępny')
    // Kropka statusu z modyfikatorem klasy
    expect(wrapper.find('.friend-status-dot--match').exists()).toBe(true)
    expect(wrapper.find('.friend-status-dot--offline').exists()).toBe(true)
  })

  it('renderuje zaproszenia przychodzące z akcjami Przyjmij/Odrzuć', async () => {
    const wrapper = mountPanel()
    fireAll('collection-init', 'friendships', [
      friendship('me', 'carol', 'invited', 'carol', 'f_carol'),
    ])
    await nextTick()

    expect(wrapper.find('.friend-invite').exists()).toBe(true)
    expect(wrapper.text()).toContain('carol')
    expect(wrapper.text()).toContain('Przyjmij')
    expect(wrapper.text()).toContain('Odrzuć')

    const acceptBtn = wrapper.findAll('button').find((b) => b.text().includes('Przyjmij'))
    await acceptBtn!.trigger('click')
    expect(mockCall).toHaveBeenCalledWith('friends:accept', { userId: 'carol' })
  })

  it('wysyła friends:invite po wpisaniu nazwy i submit', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input')
    await input.setValue('newpal')

    await wrapper.find('form').trigger('submit')
    expect(mockCall).toHaveBeenCalledWith('friends:invite', { userId: 'newpal' })
    // Pole czyści się po wysłaniu
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })
})
