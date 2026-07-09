import { Model } from 'mongoose'

import { Match } from './matches.schema'
import { Move } from './moves.schema'
import { MatchState } from './match-states.schema'
import { MatchView } from './match-views.schema'
import { MatchEvent } from './match-events.schema'
import { ResolveLog } from './resolve-log.schema'
import { PlayerMemory } from './player-memory.schema'
import { Registration } from './registrations.schema'

export interface ModelCollectionMapping {
  name: string
  model: typeof Model
  /**
   * Czy kolekcja jest wystawiana (subskrybowalna) przez gate. Prywatne kolekcje
   * games (false) NIGDY nie trafiają do rejestru polityk gate — default-deny je
   * blokuje. Flaga jest dokumentacyjna: pilnuje, byśmy świadomie decydowali.
   */
  exposed: boolean
}

export const models: ModelCollectionMapping[] = [
  { name: 'matches', model: Match, exposed: true },
  { name: 'match_views', model: MatchView, exposed: true },
  { name: 'match_events', model: MatchEvent, exposed: true },
  { name: 'moves', model: Move, exposed: false },
  { name: 'match_states', model: MatchState, exposed: false },
  { name: 'resolve_log', model: ResolveLog, exposed: false },
  { name: 'player_memory', model: PlayerMemory, exposed: false },
  { name: 'registrations', model: Registration, exposed: false },
]

export {
  Match,
  Move,
  MatchState,
  MatchView,
  MatchEvent,
  ResolveLog,
  PlayerMemory,
  Registration,
}
