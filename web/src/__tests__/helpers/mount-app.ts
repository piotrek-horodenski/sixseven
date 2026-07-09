import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, config } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

import { routes } from '@/router/routes'
import { guards } from '@/router/guards'
import { useGateStore } from '@/stores/gate/gate.store'

// Minimal stubs for all global UI components
const StubComponent = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const StubTransition = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.()
  },
})

const globalStubs: Record<string, any> = {
  UiProgress: StubComponent,
  UiLoader: StubComponent,
  UiHeightTransition: StubTransition,
  UiGeneralTransition: StubTransition,
  UiForm: StubComponent,
  UiPopup: StubComponent,
  UiMessage: StubComponent,
  UiButton: StubComponent,
  UiInput: StubComponent,
  UiTextarea: StubComponent,
  UiCheckbox: StubComponent,
  UiRadio: StubComponent,
  UiSwitch: StubComponent,
  UiNumber: StubComponent,
  UiSaveIndicator: StubComponent,
  fa: defineComponent({
    props: ['icon'],
    setup(props) {
      return () => h('i', { class: `fa-${props.icon}` })
    },
  }),
}

export interface MountAppOptions {
  route?: string
}

export async function createTestApp(options: MountAppOptions = {}) {
  const pinia = createPinia()

  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })

  guards.forEach(guard => router.beforeEach(guard))

  const App = (await import('@/App.vue')).default

  if (options.route) {
    router.push(options.route)
    await router.isReady()
  }

  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: globalStubs,
      directives: {
        tooltip: () => {}, // stub floating-vue
      },
    },
  })

  // Wait for any pending navigation
  await router.isReady()

  return { wrapper, router, pinia }
}

export interface UserProfile {
  _id: string
  username: string
  permissions: string[]
  roles?: string[]
  profile?: { display?: string }
}

/** Set up gate store as an authenticated user without socket */
export function loginAs(user: UserProfile) {
  const gate = useGateStore()
  gate.user = user
  gate.isAuthenticated = true
  gate.authToken = 'test-token'
}
