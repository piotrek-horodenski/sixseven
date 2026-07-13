import { HandlerObject } from '..'
import { createDevHandlers } from './dev.handler'
import { lazyClient } from '../games'

/**
 * Wiązanie produkcyjne handlerów dewelopera (4d): współdzielony leniwy klient
 * games + nadanie roli `developer` przez modele gate.
 *
 * UWAGA (nauczka z friends): `App` i `syncUser` ładowane przez require WEWNĄTRZ
 * funkcji — import na poziomie modułu domykałby cykl app.class → socket-handlers
 * → app w trakcie ładowania barrela.
 */

async function grantDeveloperRole(userId: string): Promise<void> {
  const { App } = require('../../app') as typeof import('../../app')
  const UserModel = App.models.find(m => m.name === 'users')?.model
  if (!UserModel) throw new Error('users model not registered')

  // $addToSet = idempotentnie; rola `developer` istnieje w seedzie
  // (hierarchia guest→player→developer→admin — seed.service).
  await UserModel.updateOne({ _id: userId }, { $addToSet: { roles: 'developer' } })

  // Przelicz allRoles/permissions i odśwież uprawnienia żywych socketów usera.
  const { syncUser } = require('../../services/sync-users.service') as typeof import('../../services/sync-users.service')
  await syncUser(userId)
}

export const devHandlers: HandlerObject[] = createDevHandlers(lazyClient, { grantDeveloperRole })
