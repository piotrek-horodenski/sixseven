import type { App } from 'vue'

import controls from '@/controls'

export default (app: App) => {
  Object.keys(controls).forEach((controlName: string) => {
    const control = controls[controlName]

    app.component(controlName, control)
  })
}
