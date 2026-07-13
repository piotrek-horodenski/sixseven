import { HandlerObject } from '..'
import { createQueueHandlers } from './queue.handler'
import { lazyClient } from '../games'

// Wiązanie produkcyjne kolejki (4e): ten sam leniwy klient games co reszta
// komend — konfiguracja czytana przy pierwszym wywołaniu, nie przy imporcie.
export const queueHandlers: HandlerObject[] = createQueueHandlers(lazyClient)
