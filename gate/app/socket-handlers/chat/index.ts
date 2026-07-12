import { HandlerObject } from '..'
import {
  createChatHandlers,
  ChatHandlerDeps,
  ChatMessageInput,
  ChatRoom,
  ChatRoomMember,
  MessagesStore,
} from './chat.handler'
import { App } from '../../app'
import { createGamesClient, GamesClient } from '../../services/games-client'
import { SettingsService } from '../../settings.service'

/**
 * Wiązanie produkcyjne czatu: mongoose-backed store `messages`, odczyt pokoju z
 * modelu `rooms`, leniwy klient gate→games (getMatch). Konfiguracja (maxLen,
 * rate-limit) czytana leniwie — barrel socket-handlers nie odpala walidacji env.
 */

function getMessageModel() {
  const model = App.models.find(m => m.name === 'messages')?.model
  if (!model) throw new Error('messages model not registered')
  return model
}

function getRoomModel() {
  const model = App.models.find(m => m.name === 'rooms')?.model
  if (!model) throw new Error('rooms model not registered')
  return model
}

function getFriendshipModel() {
  const model = App.models.find(m => m.name === 'friendships')?.model
  if (!model) throw new Error('friendships model not registered')
  return model
}

/** Czy `a` i `b` to zaakceptowani znajomi (dla scope 'dm'). Para znormalizowana a<b. */
async function areFriends(a: string, b: string): Promise<boolean> {
  const [x, y] = a < b ? [a, b] : [b, a]
  const doc = await getFriendshipModel().findOne({ a: x, b: y, status: 'accepted' }).lean()
  return !!doc
}

const mongoStore: MessagesStore = {
  async create(msg: ChatMessageInput): Promise<{ _id: string }> {
    const Model = getMessageModel()
    const doc = new Model(msg)
    await doc.save()
    return { _id: String(doc._id) }
  },
}

async function findRoom(roomId: string): Promise<ChatRoom | null> {
  const doc = await getRoomModel().findById(roomId).lean() as any
  if (!doc) return null
  const members: ChatRoomMember[] = (doc.members ?? []).map((m: any) => ({ id: m.id, kind: m.kind }))
  return { members }
}

let client: GamesClient | null = null
function getClient(): GamesClient {
  if (!client) {
    const settings = SettingsService()
    client = createGamesClient({ baseUrl: settings.gamesUrl, internalSecret: settings.internalSecret })
  }
  return client
}

function getConfig(): Pick<ChatHandlerDeps, 'maxLen' | 'rateMax' | 'rateWindowMs'> {
  const settings = SettingsService()
  return {
    maxLen: settings.maxChatLen,
    rateMax: settings.chatRateMax,
    rateWindowMs: settings.chatRateWindowMs,
  }
}

// Leniwe czytanie configu przy pierwszym wywołaniu (nie przy imporcie).
let cfg: ReturnType<typeof getConfig> | null = null
function config() {
  if (!cfg) cfg = getConfig()
  return cfg
}

export const chatHandlers: HandlerObject[] = createChatHandlers({
  store: mongoStore,
  findRoom,
  getMatch: (matchId) => getClient().getMatch(matchId),
  areFriends,
  get maxLen() { return config().maxLen },
  get rateMax() { return config().rateMax },
  get rateWindowMs() { return config().rateWindowMs },
} as ChatHandlerDeps)
