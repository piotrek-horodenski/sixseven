import NewGameIntro from '@/modules/rooms/NewGameIntro.vue'
import CreateGameView from '@/modules/rooms/CreateGameView.vue'

// Ekran tworzenia gry (Etap 3b). Zastępuje dawne `/rooms` (lista + tworzenie) —
// lista otwartych gier/moich gier żyje teraz na Home (`/`), tu jest tylko
// konfiguracja i przycisk „Utwórz".
export default {
  path: '/new',
  name: 'new-game',
  components: {
    intro: NewGameIntro,
    default: CreateGameView,
  },
}
