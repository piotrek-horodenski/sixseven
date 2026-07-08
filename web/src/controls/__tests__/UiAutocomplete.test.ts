import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import UiAutocomplete from '../UiAutocomplete.vue'

const fa = defineComponent({
  props: ['icon'],
  setup(props) {
    return () => h('i', { class: `fa-${props.icon}` })
  },
})

const options = [
  { label: 'Apple', value: 'apple' },
  { label: 'Apricot', value: 'apricot' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
  { label: 'Disabled', value: 'disabled', disabled: true },
]

function mountAutocomplete(props: Record<string, any> = {}) {
  return mount(UiAutocomplete, {
    props: {
      modelValue: null,
      options,
      placeholder: 'Search...',
      ...props,
    },
    global: {
      components: { fa },
    },
  })
}

describe('UiAutocomplete', () => {
  describe('rendering', () => {
    it('renders input with placeholder', () => {
      const wrapper = mountAutocomplete()
      const input = wrapper.find('.ui-autocomplete__input')
      expect(input.attributes('placeholder')).toBe('Search...')
    })

    it('renders label via default slot', () => {
      const wrapper = mount(UiAutocomplete, {
        props: { modelValue: null, options, placeholder: '' },
        slots: { default: 'Search Label' },
        global: { components: { fa } },
      })
      expect(wrapper.find('.ui-autocomplete__label').text()).toBe('Search Label')
    })

    it('shows selected option label in input', () => {
      const wrapper = mountAutocomplete({ modelValue: 'banana' })
      const input = wrapper.find('.ui-autocomplete__input')
      expect((input.element as HTMLInputElement).value).toBe('Banana')
    })

    it('applies disabled class', () => {
      const wrapper = mountAutocomplete({ disabled: true })
      expect(wrapper.classes()).toContain('ui-autocomplete--disabled')
    })
  })

  describe('dropdown', () => {
    it('is closed by default', () => {
      const wrapper = mountAutocomplete()
      expect(wrapper.classes()).not.toContain('ui-autocomplete--open')
    })

    it('opens on input focus', async () => {
      const wrapper = mountAutocomplete()
      await wrapper.find('.ui-autocomplete__input').trigger('focus')
      expect(wrapper.classes()).toContain('ui-autocomplete--open')
    })

    it('renders all options when no search query', async () => {
      const wrapper = mountAutocomplete()
      await wrapper.find('.ui-autocomplete__input').trigger('focus')
      const opts = wrapper.findAll('.ui-autocomplete__option')
      expect(opts).toHaveLength(5)
    })
  })

  describe('filtering', () => {
    it('filters options by search query', async () => {
      const wrapper = mountAutocomplete()
      const input = wrapper.find('.ui-autocomplete__input')
      await input.trigger('focus')
      await input.setValue('ap')
      await input.trigger('input')

      const opts = wrapper.findAll('.ui-autocomplete__option')
      expect(opts).toHaveLength(2)
      expect(opts[0].text()).toBe('Apple')
      expect(opts[1].text()).toBe('Apricot')
    })

    it('shows no results message when filter matches nothing', async () => {
      const wrapper = mountAutocomplete()
      const input = wrapper.find('.ui-autocomplete__input')
      await input.trigger('focus')
      await input.setValue('xyz')
      await input.trigger('input')

      expect(wrapper.find('.ui-autocomplete__no-results').exists()).toBe(true)
    })

    it('supports custom filterFn', async () => {
      const filterFn = (query: string, option: any) => option.value.startsWith(query)
      const wrapper = mountAutocomplete({ filterFn })
      const input = wrapper.find('.ui-autocomplete__input')
      await input.trigger('focus')
      await input.setValue('ch')
      await input.trigger('input')

      const opts = wrapper.findAll('.ui-autocomplete__option')
      expect(opts).toHaveLength(1)
      expect(opts[0].text()).toBe('Cherry')
    })
  })

  describe('selection', () => {
    it('emits update:modelValue and change on option click', async () => {
      const wrapper = mountAutocomplete()
      await wrapper.find('.ui-autocomplete__input').trigger('focus')
      await wrapper.findAll('.ui-autocomplete__option')[2].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['banana'])
      expect(wrapper.emitted('change')?.[0]).toEqual(['banana'])
    })

    it('does not emit on disabled option click', async () => {
      const wrapper = mountAutocomplete()
      await wrapper.find('.ui-autocomplete__input').trigger('focus')
      await wrapper.findAll('.ui-autocomplete__option')[4].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('shows clear button when value is selected', () => {
      const wrapper = mountAutocomplete({ modelValue: 'banana' })
      expect(wrapper.find('.ui-autocomplete__clear').exists()).toBe(true)
    })

    it('clears value on clear click', async () => {
      const wrapper = mountAutocomplete({ modelValue: 'banana' })
      await wrapper.find('.ui-autocomplete__clear').trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
      expect(wrapper.emitted('change')?.[0]).toEqual([null])
    })
  })

  describe('keyboard', () => {
    it('opens on ArrowDown', async () => {
      const wrapper = mountAutocomplete()
      await wrapper.find('.ui-autocomplete__input').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.classes()).toContain('ui-autocomplete--open')
    })

    it('closes on Escape', async () => {
      const wrapper = mountAutocomplete()
      const input = wrapper.find('.ui-autocomplete__input')
      await input.trigger('focus')
      await input.trigger('keydown', { key: 'Escape' })
      expect(wrapper.classes()).not.toContain('ui-autocomplete--open')
    })
  })

  describe('accessibility', () => {
    it('input has role combobox', () => {
      const wrapper = mountAutocomplete()
      expect(wrapper.find('.ui-autocomplete__input').attributes('role')).toBe('combobox')
    })

    it('input has aria-autocomplete', () => {
      const wrapper = mountAutocomplete()
      expect(wrapper.find('.ui-autocomplete__input').attributes('aria-autocomplete')).toBe('list')
    })

    it('dropdown has role listbox', () => {
      const wrapper = mountAutocomplete()
      expect(wrapper.find('.ui-autocomplete__dropdown').attributes('role')).toBe('listbox')
    })
  })
})
