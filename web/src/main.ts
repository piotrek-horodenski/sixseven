import '@/styles/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import router from '@/router'
import cfgs from '@/config'

const app = createApp(App)

app.use(createPinia())
app.use(router)

cfgs.forEach(cfg => {
  cfg(app)
})

app.mount('#app')
