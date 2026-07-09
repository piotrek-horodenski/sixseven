import { ref, type Ref } from 'vue'
import { useGateStore } from '@/stores/gate/gate.store'

/**
 * useCollection — reużywalna subskrypcja jednej kolekcji subskrybowalnej gate.
 *
 * Enkapsuluje wzorzec z Etapu 1 (por. color-presets.store): rejestracja
 * handlerów `collection-init|add|update|delete`, wysłanie `subscribe`,
 * ponowna rejestracja + resubskrypcja po reconnect socketu, oraz `stop()`
 * (odpięcie + `unsubscribe` + wyczyszczenie).
 *
 * Row-level: kolekcje typu `matches`/`match_views` mają politykę serwerową
 * (np. `playerId == user`), więc przekazujemy pusty `filter` — gate i tak
 * dokłada `$and` z filtrem serwera. Nie da się nim podejrzeć cudzych danych.
 *
 * Handlery reagują TYLKO na zdarzenia swojej kolekcji (pierwszy argument
 * eventu to nazwa kolekcji), więc wiele instancji `useCollection` może
 * współistnieć na jednym sockecie bez kolizji.
 */
export interface CollectionDoc {
  _id: string
  [key: string]: unknown
}

export interface UseCollection<T extends CollectionDoc> {
  docs: Ref<T[]>
  start: () => void
  stop: () => void
}

export function useCollection<T extends CollectionDoc>(
  collection: string,
  filter: Record<string, unknown> = {},
): UseCollection<T> {
  const gate = useGateStore()

  const docs = ref<T[]>([]) as Ref<T[]>
  const active = ref(false)

  function handleInit(coll: string, list: T[]) {
    if (coll !== collection) return
    docs.value = Array.isArray(list) ? list : []
  }

  function handleAdd(coll: string, doc: T) {
    if (coll !== collection || !doc?._id) return
    if (docs.value.some((d) => d._id === doc._id)) return
    docs.value.push(doc)
  }

  function handleUpdate(coll: string, doc: T) {
    if (coll !== collection || !doc?._id) return
    const index = docs.value.findIndex((d) => d._id === doc._id)
    if (index !== -1) docs.value[index] = doc
    else docs.value.push(doc) // widok nowej rundy może dotrzeć jako update — nie gub go
  }

  function handleDelete(coll: string, docId: string) {
    if (coll !== collection) return
    docs.value = docs.value.filter((d) => d._id !== docId)
  }

  // Rejestracja idempotentna: `off` przed `on`, więc reconnect na TYM SAMYM
  // sockecie (socket.io auto-reconnect) nie zdublikuje handlerów.
  function register() {
    const socket = gate.socket
    if (!socket) return
    socket.off('collection-init', handleInit)
    socket.off('collection-add', handleAdd)
    socket.off('collection-update', handleUpdate)
    socket.off('collection-delete', handleDelete)
    socket.on('collection-init', handleInit)
    socket.on('collection-add', handleAdd)
    socket.on('collection-update', handleUpdate)
    socket.on('collection-delete', handleDelete)
  }

  function unregister() {
    const socket = gate.socket
    if (!socket) return
    socket.off('collection-init', handleInit)
    socket.off('collection-add', handleAdd)
    socket.off('collection-update', handleUpdate)
    socket.off('collection-delete', handleDelete)
  }

  function subscribe() {
    gate.call('subscribe', { tickets: [{ collection, filter }] })
  }

  function onReconnect() {
    register()
    subscribe()
  }

  function start() {
    if (active.value) return
    active.value = true
    register()
    gate.onReconnect(onReconnect)
    subscribe()
  }

  function stop() {
    if (!active.value) return
    unregister()
    gate.offReconnect(onReconnect)
    gate.call('unsubscribe', { collections: [collection] })
    docs.value = []
    active.value = false
  }

  return { docs, start, stop }
}
