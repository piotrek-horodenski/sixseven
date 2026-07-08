import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import type { App } from 'vue'

export default function (app: App) {
  app.use(FloatingVue, {
    themes: {
      tooltip: {
        html: true,
      },
    },
  })
}
