import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import UiSelect from '../UiSelect.vue'

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

function mountSelect(props: Record<string, any> = {}) {
  return mount(UiSelect, {
    props: {
      modelValue: null,
      options,
      placeholder: 'Choose...',
      ...props,
    },
    global: {
      components: { fa },
    },
  })
}

describe('UiSelect', () => {
  describe('rendering', () => {
    it('renders trigger with placeholder when no value', () => {
      const wrapper = mountSelect()
      expect(wrapper.find('.ui-select__placeholder').text()).toBe('Choose...')
    })

    it('renders selected option label', () => {
      const wrapper = mountSelect({ modelValue: 'banana' })
      expect(wrapper.find('.ui-select__value').text()).toBe('Banana')
    })

    it('renders label via default slot', () => {
      const wrapper = mount(UiSelect, {
        props: { modelValue: null, options, placeholder: '' },
        slots: { default: 'My Label' },
        global: { components: { fa } },
      })
      expect(wrapper.find('.ui-select__label').text()).toBe('My Label')
    })

    it('applies disabled class', () => {
      const wrapper = mountSelect({ disabled: true })
      expect(wrapper.classes()).toContain('ui-select--disabled')
    })
  })

  describe('dropdown', () => {
    it('is closed by default', () => {
      const wrapper = mountSelect()
      expect(wrapper.classes()).not.toContain('ui-select--open')
    })

    it('opens on trigger click', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      expect(wrapper.classes()).toContain('ui-select--open')
    })

    it('closes on second trigger click', async () => {
      const wrapper = mountSelect()
      const trigger = wrapper.find('.ui-select__trigger')
      await trigger.trigger('click')
      await trigger.trigger('click')
      expect(wrapper.classes()).not.toContain('ui-select--open')
    })

    it('renders all options', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-select__option')
      expect(opts).toHaveLength(4)
      expect(opts[0].text()).toBe('Apple')
      expect(opts[3].text()).toBe('Disabled')
    })

    it('marks disabled options', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-select__option')
      expect(opts[3].classes()).toContain('ui-select__option--disabled')
    })

    it('marks selected option', async () => {
      const wrapper = mountSelect({ modelValue: 'cherry' })
      await wrapper.find('.ui-select__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-select__option')
      expect(opts[2].classes()).toContain('ui-select__option--selected')
    })
  })

  describe('selection', () => {
    it('emits update:modelValue and change on option click', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      await wrapper.findAll('.ui-select__option')[1].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['banana'])
      expect(wrapper.emitted('change')?.[0]).toEqual(['banana'])
    })

    it('does not emit on disabled option click', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      await wrapper.findAll('.ui-select__option')[3].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  describe('keyboard', () => {
    it('opens on ArrowDown', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.classes()).toContain('ui-select--open')
    })

    it('opens on Enter', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('keydown', { key: 'Enter' })
      expect(wrapper.classes()).toContain('ui-select--open')
    })

    it('closes on Escape', async () => {
      const wrapper = mountSelect()
      const trigger = wrapper.find('.ui-select__trigger')
      await trigger.trigger('click')
      await trigger.trigger('keydown', { key: 'Escape' })
      expect(wrapper.classes()).not.toContain('ui-select--open')
    })
  })

  describe('accessibility', () => {
    it('trigger has aria-haspopup', () => {
      const wrapper = mountSelect()
      expect(wrapper.find('.ui-select__trigger').attributes('aria-haspopup')).toBe('listbox')
    })

    it('dropdown has role listbox', () => {
      const wrapper = mountSelect()
      expect(wrapper.find('.ui-select__dropdown').attributes('role')).toBe('listbox')
    })

    it('options have role option', async () => {
      const wrapper = mountSelect()
      await wrapper.find('.ui-select__trigger').trigger('click')
      const opts = wrapper.findAll('.ui-select__option')
      opts.forEach(opt => {
        expect(opt.attributes('role')).toBe('option')
      })
    })
  })
})
