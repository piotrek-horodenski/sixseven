import { RPS_GAME_ID } from '@/stores/games/games.model'
import type { IGamePrefsSchema } from './prefs.model'

/**
 * Katalog schematów preferencji per gra, konsumowany generycznie przez
 * PreferencesView (renderuje listę `fields` bez wiedzy o konkretnej grze).
 *
 * Docelowo (po wystawieniu manifestu gry do weba, poza falą 2B) ten katalog
 * zostanie podmieniony na dane z `manifest.playerPrefs` — kształt jest już
 * z nim zgodny (`{ key, type, values, default, label }`), więc podmiana nie
 * wymaga zmian w PreferencesView ani w `game-prefs.store.ts`.
 */
export const GAME_PREFS_CATALOG: IGamePrefsSchema[] = [
  {
    gameId: RPS_GAME_ID,
    label: 'Papier, kamień, nożyce',
    fields: [
      {
        key: 'fallbackMove',
        type: 'enum',
        values: ['rock', 'paper', 'scissors', 'random'],
        default: 'random',
        label: 'Ruch awaryjny (gdy nie zdążysz zagrać)',
      },
    ],
  },
]
