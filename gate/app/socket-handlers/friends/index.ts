import { HandlerObject } from '..'
import {
  createFriendsHandlers,
  FriendsStore,
  FriendshipRecord,
} from './friends.handler'
import { App } from '../../app'
import { getPresenceService } from '../../services/presence.service'

/**
 * Wiązanie produkcyjne znajomych: mongoose-backed store friendships + współdzielony
 * singleton presence.service (ten sam, którego integrator używa w lifecycle
 * app.class.ts — spójny licznik sesji multi-device). Modele czytane leniwie z
 * `App.models` (barrel socket-handlers nie odpala walidacji env).
 */

function getFriendshipModel() {
  const model = App.models.find(m => m.name === 'friendships')?.model
  if (!model) throw new Error('friendships model not registered')
  return model
}

function getUserModel() {
  const model = App.models.find(m => m.name === 'users')?.model
  if (!model) throw new Error('users model not registered')
  return model
}

const mongoStore: FriendsStore = {
  async find(a, b): Promise<FriendshipRecord | null> {
    const doc: any = await getFriendshipModel().findOne({ a, b })
    if (!doc) return null
    return { a: doc.a, b: doc.b, status: doc.status, invitedBy: doc.invitedBy, nicks: doc.nicks }
  },
  async invite(a, b, invitedBy, nicks) {
    const ts = Date.now()
    // $setOnInsert: nie nadpisuje istniejącej relacji (handler i tak sprawdza brak).
    await getFriendshipModel().updateOne(
      { a, b },
      {
        $setOnInsert: { a, b, status: 'invited', invitedBy, nicks: nicks ?? {}, createdAt: ts },
        $set: { updatedAt: ts },
      },
      { upsert: true },
    )
  },
  async accept(a, b) {
    await getFriendshipModel().updateOne(
      { a, b },
      { $set: { status: 'accepted', updatedAt: Date.now() } },
    )
  },
  async remove(a, b) {
    await getFriendshipModel().deleteOne({ a, b })
  },
}

async function setInvisible(userId: string, invisible: boolean): Promise<void> {
  await getUserModel().updateOne(
    { _id: userId },
    { $set: { 'privacy.invisible': invisible } },
  )
}

/**
 * Rozwiązuje wpisany w UI identyfikator na kanoniczny `_id`. Najpierw dopasowuje
 * po NAZWIE użytkownika (typowy przypadek: „dodaj po nazwie"); jeśli brak i wpis
 * wygląda na ObjectId (24 hex) — próbuje po `_id`. Zwraca `null`, gdy brak usera.
 */
async function resolveUser(usernameOrId: string): Promise<{ id: string; username: string } | null> {
  const Users = getUserModel()
  const byName: any = await Users.findOne({ username: usernameOrId }, { _id: 1, username: 1 })
  if (byName) return { id: String(byName._id), username: byName.username }
  if (/^[a-fA-F0-9]{24}$/.test(usernameOrId)) {
    const byId: any = await Users.findById(usernameOrId, { _id: 1, username: 1 })
    if (byId) return { id: String(byId._id), username: byId.username }
  }
  return null
}

export const friendsHandlers: HandlerObject[] = createFriendsHandlers({
  store: mongoStore,
  presence: getPresenceService(),
  setInvisible,
  resolveUser,
})
