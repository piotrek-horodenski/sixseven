import { ref, type Ref } from 'vue'
import { io } from 'socket.io-client'
import type { CollectionDoc } from './useCollection'

/**
 * useTokenSocket — cienki, samodzielny klient socketu z WŁASNYM tokenem auth,
 * niezależny od `gate.store` usera. Używany tam, gdzie tożsamość jest inna niż
 * zalogowany user:
 *   - aplikacja gry (`/game/rps`) — token meczu (`match`), subskrybuje
 *     `matches` / `match_views`,
 *   - widok pokoju gościa (`/r/:code`) — token gościa (`guest`), subskrybuje
 *     `rooms`.
 *
 * Powiela minimalny protokół z Etapu 1 (subscribe + collection-*), analogicznie
 * do `useCollection`, ale na osobnej instancji `io(...)`. Nie dotyka
 * `gate.store`, więc nie miesza tokenów ani sesji.
 */

interface Sub<T extends CollectionDoc> {
  filter: Record<string, unknown>
  docs: Ref<T[]>
}

const gateUrl = import.meta.env.VITE_GATE_URL || 'wss://localhost:4114'

export interface TokenSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: Ref<any>
  connected: Ref<boolean>
  subscribe: <T extends CollectionDoc>(
    collection: string,
    filter?: Record<string, unknown>,
    docs?: Ref<T[]>,
  ) => Ref<T[]>
  call: (...args: any[]) => void
  on: (event: string, handler: (...a: any[]) => void) => void
  off: (event: string, handler: (...a: any[]) => void) => void
  connect: () => void
  disconnect: () => void
}

export function useTokenSocket(token: string): TokenSocket {
  // Typowane jako `any` (jak `gate.store`) — generyki socket.io kłócą się
  // z `Ref` pod `strict`, a i tak używamy tylko emit/on/off/disconnect.
  const socket = ref<any>(null)
  const connected = ref(false)
  const subs = new Map<string, Sub<any>>()

  function handleInit(coll: string, list: any[]) {
    const sub = subs.get(coll)
    if (!sub) return
    sub.docs.value = Array.isArray(list) ? list : []
  }

  function handleAdd(coll: string, doc: any) {
    const sub = subs.get(coll)
    if (!sub || !doc?._id) return
    if (sub.docs.value.some((d) => d._id === doc._id)) return
    sub.docs.value.push(doc)
  }

  function handleUpdate(coll: string, doc: any) {
    const sub = subs.get(coll)
    if (!sub || !doc?._id) return
    const index = sub.docs.value.findIndex((d) => d._id === doc._id)
    if (index !== -1) sub.docs.value[index] = doc
    else sub.docs.value.push(doc)
  }

  function handleDelete(coll: string, docId: string) {
    const sub = subs.get(coll)
    if (!sub) return
    sub.docs.value = sub.docs.value.filter((d) => d._id !== docId)
  }

  function register() {
    const s = socket.value
    if (!s) return
    s.off('collection-init', handleInit)
    s.off('collection-add', handleAdd)
    s.off('collection-update', handleUpdate)
    s.off('collection-delete', handleDelete)
    s.on('collection-init', handleInit)
    s.on('collection-add', handleAdd)
    s.on('collection-update', handleUpdate)
    s.on('collection-delete', handleDelete)
  }

  function subscribeAll() {
    const tickets = [...subs.entries()].map(([collection, sub]) => ({
      collection,
      filter: sub.filter,
    }))
    if (tickets.length) call('subscribe', { tickets })
  }

  function call(...args: any[]) {
    const s = socket.value
    if (!s) return
    if (s.connected) s.emit(...args)
    else s.once('connect', () => s.emit(...args))
  }

  function subscribe<T extends CollectionDoc>(
    collection: string,
    filter: Record<string, unknown> = {},
    docs?: Ref<T[]>,
  ): Ref<T[]> {
    const target = (docs ?? ref<T[]>([])) as Ref<T[]>
    subs.set(collection, { filter, docs: target })
    return target
  }

  function connect() {
    if (socket.value) disconnect()
    socket.value = io(gateUrl, { auth: { token } })
    register()
    socket.value.on('connect', () => {
      connected.value = true
      subscribeAll()
    })
    socket.value.on('disconnect', () => {
      connected.value = false
    })
  }

  function on(event: string, handler: (...a: any[]) => void) {
    socket.value?.on(event, handler)
  }

  function off(event: string, handler: (...a: any[]) => void) {
    socket.value?.off(event, handler)
  }

  function disconnect() {
    const s = socket.value
    if (!s) return
    s.removeAllListeners()
    s.disconnect()
    socket.value = null
    connected.value = false
  }

  return { socket, connected, subscribe, call, on, off, connect, disconnect }
}
