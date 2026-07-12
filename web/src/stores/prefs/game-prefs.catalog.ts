import { RPS_GAME_ID } from '@/stores/games/games.model'
import type { IGamePrefsSchema } from './prefs.model'

/**
 * Katalog schematów preferencji per gra, konsumowany generycznie przez
 * PreferencesView (renderuje listę `fields` bez wiedzy o konkretnej grze).
 *
 * i18n (fala 3): pole `label` trzyma KLUCZ i18n (`preferences.games.*`), a
 * tłumaczy je dopiero PreferencesView (`$t(label)`) — dzięki temu etykiety
 * reagują na zmianę języka bez przebudowy katalogu (stała modułu nie jest
 * reaktywna). Klucze i tłumaczenia: `i18n/locales/{pl,en}/preferences.ts`.
 *
 * Docelowo (po wystawieniu manifestu gry do weba, poza falą 2B) ten katalog
 * zostanie podmieniony na dane z `manifest.playerPrefs` — kształt jest już
 * z nim zgodny (`{ key, type, values, default, label }`); jeśli manifest
 * przyniesie literały zamiast kluczy, wystarczy zdjąć `$t()` w PreferencesView.
 */
export const GAME_PREFS_CATALOG: IGamePrefsSchema[] = [
  {
    gameId: RPS_GAME_ID,
    label: 'preferences.games.rps.title',
    fields: [
      {
        key: 'fallbackMove',
        type: 'enum',
        values: ['rock', 'paper', 'scissors', 'random'],
        default: 'random',
        label: 'preferences.games.rps.fallbackMove',
      },
    ],
  },
]
