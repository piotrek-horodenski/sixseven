import PreferencesView from '@/modules/preferences/PreferencesView.vue'
import PreferencesIntro from '@/modules/preferences/PreferencesIntro.vue'

// Ekran „Preferencje" w menu profilu (Etap 3B, fala 2B): motyw, język,
// ustawienia per gra. Nie wpięte do `routes/index.ts` — robi to koordynator.
export default {
  path: '/preferences',
  name: 'preferences',
  components: {
    intro: PreferencesIntro,
    default: PreferencesView,
  },
}
