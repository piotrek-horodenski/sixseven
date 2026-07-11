import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { mockFind, mockStreamEmitter } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockStreamEmitter: new (require('events').EventEmitter)(),
}))

vi.mock('mongoose', () => ({
  default: {
    connection: {
      collection: vi.fn(() => ({
        watch: vi.fn(() => mockStreamEmitter),
      })),
    },
  },
}))

vi.mock('query', () => ({
  query: vi.fn((docs: any[], filter: any) => {
    if (!filter || Object.keys(filter).length === 0) return docs
    return docs.filter((doc: any) =>
      Object.entries(filter).every(([k, v]) => doc[k] === v)
    )
  }),
}))

vi.mock('../../app/models', () => ({
  models: [{ name: 'messages', model: { find: mockFind } }],
}))

vi.mock('../../app/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../../app/settings.service', () => ({
  SettingsService: vi.fn(() => ({ subscriptionQueryLimit: 100 })),
}))

import { SubscriptionsManager } from '../../app/subscriptions/subscriptions'
import logger from '../../app/logger'

describe('SubscriptionsManager', () => {
  let manager: SubscriptionsManager

  beforeEach(() => {
    manager = new SubscriptionsManager()
    // Stub out methods that interact with mongoose streams and socket IO
    manager.checkCollections = vi.fn()
    manager.emitInitialData = vi.fn()
    vi.clearAllMocks()
  })

  describe('subscribe()', () => {
    it('creates new subscription', () => {
      manager.subscribe('user1', [{ collection: 'users', filter: {} }])
      expect(manager.subscriptions).toHaveLength(1)
      expect(manager.subscriptions[0].subscriberId).toBe('user1')
      expect(manager.subscriptions[0].tickets).toHaveLength(1)
    })

    it('adds tickets to existing subscription', () => {
      manager.subscribe('user1', [{ collection: 'users', filter: {} }])
      manager.subscribe('user1', [{ collection: 'messages', filter: {} }])
      expect(manager.subscriptions).toHaveLength(1)
      expect(manager.subscriptions[0].tickets).toHaveLength(2)
    })
  })

  describe('unsubscribe()', () => {
    it('removes all subscriptions when no collections specified', () => {
      manager.subscribe('user1', [{ collection: 'users', filter: {} }])
      manager.unsubscribe('user1', [])
      expect(manager.subscriptions).toHaveLength(0)
    })

    it('removes specific collections only', () => {
      manager.subscribe('user1', [
        { collection: 'users', filter: {} },
        { collection: 'messages', filter: {} },
      ])
      manager.unsubscribe('user1', ['users'])
      expect(manager.subscriptions).toHaveLength(1)
      expect(manager.subscriptions[0].tickets).toHaveLength(1)
      expect(manager.subscriptions[0].tickets[0].collection).toBe('messages')
    })

    it('does nothing when subscriber not found', () => {
      manager.subscribe('user1', [{ collection: 'users', filter: {} }])
      manager.unsubscribe('user999', ['users'])
      expect(manager.subscriptions).toHaveLength(1)
    })

    it('removes subscription entirely when all collections unsubscribed', () => {
      manager.subscribe('user1', [
        { collection: 'users', filter: {} },
      ])
      manager.unsubscribe('user1', ['users'])
      expect(manager.subscriptions).toHaveLength(0)
    })
  })

  describe('collections getter', () => {
    it('returns unique collection names', () => {
      manager.subscribe('user1', [{ collection: 'users', filter: {} }])
      manager.subscribe('user2', [
        { collection: 'users', filter: {} },
        { collection: 'messages', filter: {} },
      ])
      expect(manager.collections).toEqual(['users', 'messages'])
    })
  })

  describe('collectionsExtended', () => {
    it('groups subscribers by collection', () => {
      manager.subscribe('user1', [
        { collection: 'users', filter: {} },
        { collection: 'messages', filter: {} },
      ])
      manager.subscribe('user2', [{ collection: 'users', filter: { active: true } }])

      const extended = manager.collectionsExtended

      const usersEntry = extended.find(e => e.collection === 'users')
      const messagesEntry = extended.find(e => e.collection === 'messages')

      expect(usersEntry).toBeDefined()
      expect(usersEntry!.subscribers).toHaveLength(2)
      expect(usersEntry!.subscribers[0].subscriberId).toBe('user1')
      expect(usersEntry!.subscribers[1].subscriberId).toBe('user2')

      expect(messagesEntry).toBeDefined()
      expect(messagesEntry!.subscribers).toHaveLength(1)
      expect(messagesEntry!.subscribers[0].subscriberId).toBe('user1')
    })
  })

  describe('collectionsForFilters', () => {
    it('groups tickets by unique filters per collection', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      manager.subscribe('user1', [
        { collection: 'messages', filter: { dest: null }, socket },
        { collection: 'messages', filter: { dest: 'user2' }, socket },
      ])
      manager.subscribe('user2', [
        { collection: 'messages', filter: { dest: null }, socket },
      ])

      const result = manager.collectionsForFilters
      expect(result).toHaveLength(1)
      expect(result[0].collection).toBe('messages')
      expect(result[0].filters).toHaveLength(2)

      const nullFilter = result[0].filters.find(
        (f: any) => JSON.stringify(f.filter) === JSON.stringify({ dest: null })
      )
      expect(nullFilter!.tickets).toHaveLength(2)

      const user2Filter = result[0].filters.find(
        (f: any) => JSON.stringify(f.filter) === JSON.stringify({ dest: 'user2' })
      )
      expect(user2Filter!.tickets).toHaveLength(1)
    })
  })

  describe('emitInitialDataForTicket()', () => {
    it('queries model and emits collection-init to socket', async () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const docs = [{ _id: '1', text: 'hello' }, { _id: '2', text: 'world' }]
      const asyncIterable = {
        [Symbol.asyncIterator]: () => {
          let i = 0
          return { next: () => Promise.resolve(i < docs.length ? { value: docs[i++], done: false } : { value: undefined, done: true }) }
        },
        limit: vi.fn().mockReturnThis(),
      }
      mockFind.mockReturnValue(asyncIterable)

      await manager.emitInitialDataForTicket({
        collection: 'messages',
        filter: { dest: null },
        socket,
      })

      expect(mockFind).toHaveBeenCalledWith({ dest: null })
      expect(asyncIterable.limit).toHaveBeenCalledWith(100)
      expect(socket.emit).toHaveBeenCalledWith('collection-init', 'messages', docs)
    })

    it('logs error when model not found', async () => {
      const socket: any = { emit: vi.fn(), id: 's1' }

      await manager.emitInitialDataForTicket({
        collection: 'nonexistent',
        filter: {},
        socket,
      })

      expect(logger.error).toHaveBeenCalled()
      expect(socket.emit).not.toHaveBeenCalled()
    })
  })

  describe('checkCollections()', () => {
    it('creates streams for new collections', () => {
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {} }])

      expect(realManager.streams).toHaveLength(1)
      expect(realManager.streams[0].name).toBe('messages')
      expect(realManager.lastCollections).toEqual(['messages'])
    })

    it('closes streams for removed collections', () => {
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {} }])

      const mockClose = vi.fn()
      realManager.streams[0].stream.close = mockClose

      realManager.unsubscribe('user1', [])

      expect(mockClose).toHaveBeenCalled()
      expect(realManager.streams).toHaveLength(1) // stream object remains but was closed
      expect(realManager.lastCollections).toEqual([])
    })

    it('only adds streams for genuinely new collections', () => {
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {} }])
      expect(realManager.streams).toHaveLength(1)

      // Subscribe another user to same collection
      realManager.subscribe('user2', [{ collection: 'messages', filter: { dest: 'user2' } }])
      // Should not create another stream
      expect(realManager.streams).toHaveLength(1)
    })
  })

  describe('createNewStream() change handler', () => {
    it('emits collection-add on insert', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket }])

      const doc = { _id: '1', text: 'hello' }
      mockStreamEmitter.emit('change', {
        operationType: 'insert',
        fullDocument: doc,
      })

      expect(socket.emit).toHaveBeenCalledWith('collection-add', 'messages', doc)
    })

    it('emits collection-delete on delete', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket }])

      const doc = { _id: '1', text: 'hello' }
      mockStreamEmitter.emit('change', {
        operationType: 'delete',
        documentKey: { _id: '1' },
        fullDocumentBeforeChange: doc,
      })

      expect(socket.emit).toHaveBeenCalledWith('collection-delete', 'messages', '1')
    })

    it('emits collection-update with the full document when doc still matches filter', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket }])

      const fullDoc = { _id: '1', text: 'new' }
      mockStreamEmitter.emit('change', {
        operationType: 'update',
        fullDocumentBeforeChange: { _id: '1', text: 'old' },
        fullDocument: fullDoc,
      })

      expect(socket.emit).toHaveBeenCalledWith('collection-update', 'messages', fullDoc)
    })

    it('emits collection-delete when doc no longer matches filter after update', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: { active: true }, socket }])

      mockStreamEmitter.emit('change', {
        operationType: 'update',
        fullDocumentBeforeChange: { _id: '1', active: true },
        fullDocument: { _id: '1', active: false },
      })

      expect(socket.emit).toHaveBeenCalledWith('collection-delete', 'messages', '1')
    })

    it('emits collection-update when doc starts matching filter after update (klient robi update-or-add; pre-images wyłączone)', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: { active: true }, socket }])

      mockStreamEmitter.emit('change', {
        operationType: 'update',
        fullDocumentBeforeChange: { _id: '1', active: false },
        fullDocument: { _id: '1', active: true },
      })

      // Handler `update` NIE polega na fullDocumentBeforeChange (pre-images off).
      // Gdy dokument po zmianie pasuje do filtra → `collection-update`, a klient
      // robi update-or-add. `collection-add` leci wyłącznie na `insert`.
      expect(socket.emit).toHaveBeenCalledWith('collection-update', 'messages', { _id: '1', active: true })
    })

    it('logs warning for unhandled operation types', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket }])

      mockStreamEmitter.emit('change', {
        operationType: 'rename',
      })

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ operationType: 'rename' }),
        expect.any(String),
      )
    })

    it('does not emit when insert does not match filter', () => {
      const socket: any = { emit: vi.fn(), id: 's1' }
      const realManager = new SubscriptionsManager()
      realManager.subscribe('user1', [{ collection: 'messages', filter: { dest: 'user2' }, socket }])

      mockStreamEmitter.emit('change', {
        operationType: 'insert',
        fullDocument: { _id: '1', dest: 'user3' },
      })

      expect(socket.emit).not.toHaveBeenCalled()
    })
  })

  describe('multi-device (same user, two sockets)', () => {
    it('keeps a separate ticket per socket for the same collection+filter', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }
      const socketB: any = { emit: vi.fn(), id: 'sB' }

      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])
      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketB }])

      expect(manager.subscriptions).toHaveLength(1)
      // Both devices retained despite identical collection+filter.
      expect(manager.subscriptions[0].tickets).toHaveLength(2)
      const ids = manager.subscriptions[0].tickets.map(t => t.socket?.id).sort()
      expect(ids).toEqual(['sA', 'sB'])
    })

    it('still dedupes a true duplicate (same socket, same collection+filter)', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }

      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])
      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])

      expect(manager.subscriptions[0].tickets).toHaveLength(1)
    })

    it('change events fan out to both devices', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }
      const socketB: any = { emit: vi.fn(), id: 'sB' }
      const realManager = new SubscriptionsManager()

      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])
      realManager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketB }])

      const doc = { _id: '1', text: 'hi' }
      mockStreamEmitter.emit('change', { operationType: 'insert', fullDocument: doc })

      expect(socketA.emit).toHaveBeenCalledWith('collection-add', 'messages', doc)
      expect(socketB.emit).toHaveBeenCalledWith('collection-add', 'messages', doc)
    })
  })

  describe('unsubscribeSocket() — per-device cleanup', () => {
    it('disconnecting one device leaves the other device subscribed', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }
      const socketB: any = { emit: vi.fn(), id: 'sB' }

      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])
      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketB }])

      // Device A disconnects.
      manager.unsubscribeSocket('user1', 'sA', [])

      expect(manager.subscriptions).toHaveLength(1)
      expect(manager.subscriptions[0].tickets).toHaveLength(1)
      expect(manager.subscriptions[0].tickets[0].socket?.id).toBe('sB')
    })

    it('removes only the listed collections for that socket', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }

      manager.subscribe('user1', [
        { collection: 'messages', filter: {}, socket: socketA },
        { collection: 'users', filter: {}, socket: socketA },
      ])

      manager.unsubscribeSocket('user1', 'sA', ['messages'])

      expect(manager.subscriptions[0].tickets).toHaveLength(1)
      expect(manager.subscriptions[0].tickets[0].collection).toBe('users')
    })

    it('drops the subscription entirely when the last socket leaves', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }
      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])

      manager.unsubscribeSocket('user1', 'sA', [])

      expect(manager.subscriptions).toHaveLength(0)
    })

    it('does nothing when subscriber not found', () => {
      const socketA: any = { emit: vi.fn(), id: 'sA' }
      manager.subscribe('user1', [{ collection: 'messages', filter: {}, socket: socketA }])

      manager.unsubscribeSocket('user999', 'sX', [])

      expect(manager.subscriptions).toHaveLength(1)
    })
  })
})
