import { HandlerObject } from '..'
import {
  createRoomsHandlers,
  generateRoomCode,
  Room,
  RoomMember,
  RoomsStore,
  CreateRoomInput,
} from './rooms.handler'
import { App } from '../../app'
import { createGamesClient, GamesClient } from '../../services/games-client'
import { SettingsService } from '../../settings.service'

/**
 * Wiązanie produkcyjne pokoi: mongoose-backed store + leniwy klient gate→games
 * (konfiguracja czytana przy pierwszym użyciu, nie przy imporcie — barrel
 * socket-handlers nie odpala walidacji env).
 */

function getRoomModel() {
  const model = App.models.find(m => m.name === 'rooms')?.model
  if (!model) throw new Error('rooms model not registered')
  return model
}

function toRoom(doc: any): Room {
  return {
    _id: String(doc._id),
    code: doc.code,
    gameId: doc.gameId,
    name: doc.name ?? '',
    hostId: doc.hostId,
    hostKind: doc.hostKind ?? 'user',
    visibility: doc.visibility ?? 'public',
    status: doc.status ?? 'open',
    members: (doc.members ?? []).map((m: any): RoomMember => ({ id: m.id, kind: m.kind, nick: m.nick })),
    matchId: doc.matchId ?? null,
  }
}

const mongoStore: RoomsStore = {
  async create(input: CreateRoomInput): Promise<Room> {
    const Model = getRoomModel()
    const doc = new Model({
      code: input.code,
      gameId: input.gameId,
      name: input.name,
      hostId: input.hostId,
      hostKind: input.hostKind,
      visibility: input.visibility,
      status: 'open',
      members: input.members,
      matchId: null,
    })
    await doc.save()
    return toRoom(doc)
  },
  async findByCode(code) {
    const doc = await getRoomModel().findOne({ code })
    return doc ? toRoom(doc) : null
  },
  async findById(roomId) {
    const doc = await getRoomModel().findById(roomId)
    return doc ? toRoom(doc) : null
  },
  async addMember(roomId, member) {
    await getRoomModel().updateOne(
      { _id: roomId, 'members.id': { $ne: member.id } },
      { $push: { members: member }, $set: { updatedAt: Date.now() } },
    )
  },
  async removeMember(roomId, memberId) {
    await getRoomModel().updateOne(
      { _id: roomId },
      { $pull: { members: { id: memberId } }, $set: { updatedAt: Date.now() } },
    )
  },
  async setStatus(roomId, status) {
    await getRoomModel().updateOne({ _id: roomId }, { $set: { status, updatedAt: Date.now() } })
  },
  async setMatched(roomId, matchId) {
    await getRoomModel().updateOne(
      { _id: roomId },
      { $set: { matchId, status: 'matched', updatedAt: Date.now() } },
    )
  },
}

let client: GamesClient | null = null
function getClient(): GamesClient {
  if (!client) {
    const settings = SettingsService()
    client = createGamesClient({ baseUrl: settings.gamesUrl, internalSecret: settings.internalSecret })
  }
  return client
}
const lazyClient: Pick<GamesClient, 'createMatch'> = {
  createMatch: (input) => getClient().createMatch(input),
}

export const roomsHandlers: HandlerObject[] = createRoomsHandlers({
  client: lazyClient,
  store: mongoStore,
  genCode: () => generateRoomCode(),
})
