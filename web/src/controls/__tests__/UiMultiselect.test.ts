import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import UiMultiselect from '../UiMultiselect.vue'

const fa = defineComponent({
  props: ['icon'],
  setup(props) {
    return () => h('i', { class: `fa-${props.icon}` })
  },
})

const options = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
  { label: 'Disabled', value: 'disabled', disabled: true },
]

function mountMultiselect(props: Record<string, any> = {}) {
  return mount(UiMultiselect, {
    props: {
      modelValue: [],
      options,
      placeholder: 'Choose...',
      ...props,
    },
    global: {
      components: { fa },
    },
  })
}

describe('UiMultiselect', () => {
  describe('rendering', () => {
    it('renders trigger with placeholder when empty', () => {
      const wrapper = mountMultiselect()
      expect(wrapper.find('.ui-multiselect__placeholder').text()).toBe('Choose...')
    })

    it('renders chips for selected values', () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'cherry'] })
      const chips = wrapper.findAll('.ui-multiselect__chip')
      expect(chips).toHaveLength(2)
      expect(chips[0].text()).toContain('Apple')
      expect(chips[1].text()).toContain('Cherry')
    })

    it('does not show placeholder when values are selected', () => {
      const wrapper = mountMultiselect({ modelValue: ['apple'] })
      expect(wrapper.find('.ui-multiselect__placeholder').exists()).toBe(false)
    })

    it('renders label via default slot', () => {
      const wrapper = mount(UiMultiselect, {
        props: { modelValue: [], options, placeholder: '' },
        slots: { default: 'My Label' },
        global: { components: { fa } },
      })
      expect(wrapper.find('.ui-multiselect__label').text()).toBe('My Label')
    })

    it('applies disabled class', () => {
      const wrapper = mountMultiselect({ disabled: true })
      expect(wrapper.classes()).toContain('ui-multiselect--disabled')
    })
  })

  describe('dropdown', () => {
    it('is closed by default', () => {
      const wrapper = mountMultiselect()
      expect(wrapper.classes()).not.toContain('ui-multiselect--open')
    })

    it('opens on trigger click', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      expect(wrapper.classes()).toContain('ui-multiselect--open')
    })

    it('renders all options', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      expect(wrapper.findAll('.ui-multiselect__option')).toHaveLength(4)
    })

    it('marks selected options', async () => {
      const wrapper = mountMultiselect({ modelValue: ['banana'] })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-multiselect__option')
      expect(opts[1].classes()).toContain('ui-multiselect__option--selected')
    })

    it('marks disabled options', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-multiselect__option')
      expect(opts[3].classes()).toContain('ui-multiselect__option--disabled')
    })

    it('stays open after selecting an option', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[0].trigger('click')
      expect(wrapper.classes()).toContain('ui-multiselect--open')
    })
  })

  describe('selection', () => {
    it('emits added value on option click', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[1].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['banana']])
      expect(wrapper.emitted('change')?.[0]).toEqual([['banana']])
    })

    it('emits removed value when clicking selected option', async () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'banana'] })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['banana']])
    })

    it('does not emit on disabled option click', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[3].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  describe('chip removal', () => {
    it('removes option when chip remove is clicked', async () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'banana'] })
      await wrapper.findAll('.ui-multiselect__chip-remove')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['banana']])
    })
  })

  describe('max limit', () => {
    it('prevents selection beyond max', async () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'banana'], max: 2 })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[2].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('allows deselection when at max', async () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'banana'], max: 2 })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__option')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['banana']])
    })
  })

  describe('select all / clear', () => {
    it('select all selects all non-disabled options', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__action')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['apple', 'banana', 'cherry']])
    })

    it('select all respects max', async () => {
      const wrapper = mountMultiselect({ max: 2 })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__action')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['apple', 'banana']])
    })

    it('clear all deselects everything', async () => {
      const wrapper = mountMultiselect({ modelValue: ['apple', 'banana'] })
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      await wrapper.findAll('.ui-multiselect__action')[1].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
    })
  })

  describe('keyboard', () => {
    it('opens on ArrowDown', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.classes()).toContain('ui-multiselect--open')
    })

    it('closes on Escape', async () => {
      const wrapper = mountMultiselect()
      const trigger = wrapper.find('.ui-multiselect__trigger')
      await trigger.trigger('click')
      await trigger.trigger('keydown', { key: 'Escape' })
      expect(wrapper.classes()).not.toContain('ui-multiselect--open')
    })
  })

  describe('accessibility', () => {
    it('trigger has aria-haspopup', () => {
      const wrapper = mountMultiselect()
      expect(wrapper.find('.ui-multiselect__trigger').attributes('aria-haspopup')).toBe('listbox')
    })

    it('dropdown has role listbox', () => {
      const wrapper = mountMultiselect()
      expect(wrapper.find('.ui-multiselect__dropdown').attributes('role')).toBe('listbox')
    })

    it('dropdown has aria-multiselectable', () => {
      const wrapper = mountMultiselect()
      expect(wrapper.find('.ui-multiselect__dropdown').attributes('aria-multiselectable')).toBe('true')
    })

    it('options have role option', async () => {
      const wrapper = mountMultiselect()
      await wrapper.find('.ui-multiselect__trigger').trigger('click')
      wrapper.findAll('.ui-multiselect__option').forEach(opt => {
        expect(opt.attributes('role')).toBe('option')
      })
    })
  })
})
