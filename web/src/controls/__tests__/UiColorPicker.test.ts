import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import UiColorPicker from '../UiColorPicker.vue'

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
}))

vi.mock('@/stores/color-presets/color-presets.store', () => ({
  useColorPresetsStore: vi.fn(() => ({
    colorPresets: [],
    init: vi.fn(),
    createPreset: vi.fn(),
    deletePreset: vi.fn(),
  })),
}))

const fa = defineComponent({
  props: ['icon'],
  setup(props) {
    return () => h('i', { class: `fa-${props.icon}` })
  },
})

function mountPicker(props: Record<string, any> = {}) {
  return mount(UiColorPicker, {
    props: {
      modelValue: '#d4953d',
      ...props,
    },
    global: {
      components: { fa },
    },
  })
}

describe('UiColorPicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering', () => {
    it('renders trigger with color swatch', () => {
      const wrapper = mountPicker()
      expect(wrapper.find('.ui-color-picker__swatch').exists()).toBe(true)
    })

    it('renders hex value in trigger', () => {
      const wrapper = mountPicker()
      expect(wrapper.find('.ui-color-picker__value').text()).toBe('#d4953d')
    })

    it('renders label via default slot', () => {
      const wrapper = mount(UiColorPicker, {
        props: { modelValue: '#ff0000' },
        slots: { default: 'Color Label' },
        global: { components: { fa } },
      })
      expect(wrapper.find('.ui-color-picker__label').text()).toBe('Color Label')
    })

    it('applies disabled class', () => {
      const wrapper = mountPicker({ disabled: true })
      expect(wrapper.classes()).toContain('ui-color-picker--disabled')
    })

    it('renders chevron icon', () => {
      const wrapper = mountPicker()
      expect(wrapper.find('.ui-color-picker__chevron').exists()).toBe(true)
    })
  })

  describe('panel', () => {
    it('is closed by default', () => {
      const wrapper = mountPicker()
      expect(wrapper.classes()).not.toContain('ui-color-picker--open')
    })

    it('opens on trigger click', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.classes()).toContain('ui-color-picker--open')
    })

    it('closes on second trigger click', async () => {
      const wrapper = mountPicker()
      const trigger = wrapper.find('.ui-color-picker__trigger')
      await trigger.trigger('click')
      await trigger.trigger('click')
      expect(wrapper.classes()).not.toContain('ui-color-picker--open')
    })

    it('closes on Escape', async () => {
      const wrapper = mountPicker()
      const trigger = wrapper.find('.ui-color-picker__trigger')
      await trigger.trigger('click')
      await trigger.trigger('keydown', { key: 'Escape' })
      expect(wrapper.classes()).not.toContain('ui-color-picker--open')
    })

    it('renders satval area', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__satval').exists()).toBe(true)
    })

    it('renders hue slider', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__hue').exists()).toBe(true)
    })
  })

  describe('tabs', () => {
    it('renders two tabs', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      const tabs = wrapper.findAll('.ui-color-picker__tab')
      expect(tabs).toHaveLength(2)
      expect(tabs[0].text()).toBe('Wybierz kolor')
      expect(tabs[1].text()).toBe('Presety')
    })

    it('picker tab is active by default', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      const tabs = wrapper.findAll('.ui-color-picker__tab')
      expect(tabs[0].classes()).toContain('ui-color-picker__tab--active')
    })

    it('switches to presets tab on click', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      const tabs = wrapper.findAll('.ui-color-picker__tab')
      await tabs[1].trigger('click')
      expect(tabs[1].classes()).toContain('ui-color-picker__tab--active')
    })
  })

  describe('format switching', () => {
    it('shows HEX format by default', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__format-label').text()).toBe('HEX')
    })

    it('cycles to RGB on format click', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      await wrapper.find('.ui-color-picker__format-label').trigger('click')
      expect(wrapper.find('.ui-color-picker__format-label').text()).toBe('RGB')
    })

    it('cycles to HSL on second format click', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      await wrapper.find('.ui-color-picker__format-label').trigger('click')
      await wrapper.find('.ui-color-picker__format-label').trigger('click')
      expect(wrapper.find('.ui-color-picker__format-label').text()).toBe('HSL')
    })

    it('cycles back to HEX on third format click', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      const label = wrapper.find('.ui-color-picker__format-label')
      await label.trigger('click')
      await label.trigger('click')
      await label.trigger('click')
      expect(label.text()).toBe('HEX')
    })

    it('shows 3 inputs in RGB mode', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      await wrapper.find('.ui-color-picker__format-label').trigger('click')
      const fields = wrapper.findAll('.ui-color-picker__field')
      expect(fields).toHaveLength(3)
    })
  })

  describe('opacity', () => {
    it('does not show alpha slider by default', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__alpha').exists()).toBe(false)
    })

    it('shows alpha slider when hasOpacity is true', async () => {
      const wrapper = mountPicker({ hasOpacity: true, modelValue: '#ffd4953d' })
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__alpha').exists()).toBe(true)
    })

    it('shows checkerboard swatch when hasOpacity is true', () => {
      const wrapper = mountPicker({ hasOpacity: true, modelValue: '#80d4953d' })
      expect(wrapper.find('.ui-color-picker__swatch--checkerboard').exists()).toBe(true)
    })

    it('does not show checkerboard without hasOpacity', () => {
      const wrapper = mountPicker()
      expect(wrapper.find('.ui-color-picker__swatch--checkerboard').exists()).toBe(false)
    })

    it('shows 4 inputs in RGB mode with opacity', async () => {
      const wrapper = mountPicker({ hasOpacity: true, modelValue: '#ffd4953d' })
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      await wrapper.find('.ui-color-picker__format-label').trigger('click')
      const fields = wrapper.findAll('.ui-color-picker__field')
      expect(fields).toHaveLength(4)
    })
  })

  describe('save preset', () => {
    it('renders save preset link in picker tab', async () => {
      const wrapper = mountPicker()
      await wrapper.find('.ui-color-picker__trigger').trigger('click')
      expect(wrapper.find('.ui-color-picker__save-preset').exists()).toBe(true)
    })
  })
})
