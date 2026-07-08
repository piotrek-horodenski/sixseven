import mongoose from 'mongoose'
import { Socket } from 'socket.io'

// @ts-ignore — untyped GitHub dependency
import { query } from 'query'

import { models } from '../models'
import { SettingsService } from '../settings.service'
import logger from '../logger'

const sensitiveFields: Record<string, string[]> = {
  users: ['password', 'token'],
}

function sanitizeDoc(collection: string, doc: any): any {
  const fields = sensitiveFields[collection]
  if (!fields || !doc) return doc
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  for (const field of fields) {
    delete obj[field]
  }
  return obj
}

export interface SubscriptionTicketFilter {
  [key: string]: [value: any],
}

export interface SubscriptionTicket {
  collection: string
  filter: SubscriptionTicketFilter
  socket?: Socket
}

export class Subscription {
  subscriberId: string
  tickets: SubscriptionTicket[]
  isReady: boolean

  constructor(subscriberId: string, tickets: SubscriptionTicket[] = []) {
    this.subscriberId = subscriberId
    this.tickets = tickets
    this.isReady = false
  }

  get collections() {
    return this.tickets
    .filter((ticket, index, array) => {
      const firstIndex = array.findIndex(t => t.collection === ticket.collection)
      
      return firstIndex === index
    })
    .map(ticket => ticket.collection)
  }

  addTickets(tickets: SubscriptionTicket[]) {
    const addedTickets: SubscriptionTicket[] = []
    tickets.forEach(ticket => {
      const existing = this.tickets
        .find(e => {
          return e.collection === ticket.collection &&
            JSON.stringify(e.filter || {}) === JSON.stringify(ticket.filter)
        })

      if (existing) {
        return
      }

      addedTickets.push(ticket)
      this.tickets.push(ticket)
    })

    return addedTickets
  }
}

export class SubscriptionStream {
  name: string
  stream: any

  constructor(collection: string) {
    this.name = collection

    this.attachToCollection()
  }

  attachToCollection() {
    const db = mongoose.connection
    const collection = db.collection(this.name)

    this.stream = collection.watch([], {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
    })
  }
}

export class SubscriptionsManager {
  public subscriptions: Subscription[]

  lastCollections: string[]
  streams: SubscriptionStream[]

  constructor() {
    this.subscriptions = []
    this.lastCollections = []
    this.streams = []
  }

  get collections(): string[] {
    return this.subscriptions
      .reduce<string[]>((p, c) => {
        const cols = c.collections
          .filter(col => -1 === p.indexOf(col))
        return [...p, ...cols]
      }, [])
  }

  get collectionsExtended() {
    return this.collections
      .map(collection => {
        const subscribersObjects = this.subscriptions
          .filter(sub => -1 < sub.collections.indexOf(collection))
        
        const subscribers = subscribersObjects
          .map(subscriberObject => {
            return {
              subscriberId: subscriberObject.subscriberId,
              tickets: subscriberObject.tickets
                .filter(ticket => {
                  return ticket.collection === collection
                }),
            }
          })
        return {
          collection,
          subscribers,
        }
      })
  }

  get collectionsForFilters() {
    return this.collections
      .map(collection => {
        const colFilteredSubs = this.subscriptions
          .map(sub => {
            return {
              ...sub,
              tickets: sub.tickets
                .filter(item => item.collection === collection),
            }
          })
          .filter(sub => sub.tickets.length > 0)

        const allTickets = colFilteredSubs
          .reduce<SubscriptionTicket[]>((p, c) => {
            return [...p, ...c.tickets]
          }, [])
        const uniqueFilters = allTickets
          .filter((ticket, index, array) => {
            const sarray = array.map(item => JSON.stringify(item.filter))
            const item = JSON.stringify(ticket.filter)
            return index === sarray.indexOf(item)
          })
        const filters = uniqueFilters
          .map((uniqueTicket) => {
            const filter = uniqueTicket.filter
            const tickets = allTickets
              .filter(item => JSON.stringify(item.filter) === JSON.stringify(filter))
            return {
              filter,
              tickets,
            }
          })
          
        return {
          collection,
          filters,
        }
      })
  }

  subscribe(subscriberId: string, tickets: SubscriptionTicket[]) {
    const subscription = this.subscriptions
      .find(s => s.subscriberId === subscriberId)
    
    let addedTickets: SubscriptionTicket[] = []
    if (subscription) {
      addedTickets = subscription.addTickets(tickets)
    } else {
      this.subscriptions.push(new Subscription(subscriberId, tickets))
      addedTickets = tickets
    }

    this.emitInitialData(addedTickets)

    this.checkCollections()
  }

  unsubscribe(subscriberId: string, collections: string[] = []) {
    const subscription = this.subscriptions
      .find(s => s.subscriberId === subscriberId)
    
    if (!subscription) {
      return
    }

    const index = this.subscriptions
      .findIndex(s => s.subscriberId === subscriberId)

    if (0 === collections.length) {
      this.subscriptions.splice(index, 1)

      this.checkCollections()
      return
    }

    subscription.tickets = subscription.tickets
      .filter(ticket => -1 === collections.indexOf(ticket.collection))

    if (subscription.collections.length === 0) {
      this.subscriptions.splice(index, 1)
    }

    this.checkCollections()
  }

  emitInitialData(tickets: SubscriptionTicket[]) {
    tickets.forEach(this.emitInitialDataForTicket)
  }

  async emitInitialDataForTicket(ticket: SubscriptionTicket) {
    try {
      const model = models.find(model => model.name === ticket.collection)?.model

      const settings = SettingsService()
      const elements = model!.find(ticket.filter).limit(settings.subscriptionQueryLimit)
      const array = []
      for await (const doc of elements) {
        array.push(doc)
      }
      ticket.socket!.emit('collection-init', ticket.collection, array.map(doc => sanitizeDoc(ticket.collection, doc)))
    } catch (err) {
      logger.error({ err, collection: ticket.collection }, 'failed to emit initial data for ticket')
    }
  }

  matches(doc: any, filter: SubscriptionTicketFilter) {
    const result = query([doc], filter)

    return result.length === 1
  }

  createNewStream(collection: string) {
    const sub = new SubscriptionStream(collection)

    logger.debug({ collections: this.collections }, 'creating new stream')

    sub.stream.on('change', (next: any) => {
      try {
        logger.debug({ collection, operationType: next.operationType }, 'change event received')
        const subs = this.collectionsForFilters
        const sub = subs.find(item => item.collection === collection)
        if (!sub) {
          logger.warn({ collection }, 'no subscription found for collection in change event')
          return
        }
        const operationType = next.operationType
        const matchWitchCallback = (doc: any, clb: (filter: SubscriptionTicketFilter, tickets: SubscriptionTicket[]) => void) => {
          sub.filters.forEach(({ filter, tickets }: { filter: SubscriptionTicketFilter, tickets: SubscriptionTicket[] }) => {
            if (this.matches(doc, filter)) {
              clb(filter, tickets)
            }
          })
        }
        const actionByType = {
          insert: () => {
            const docToMatch = next.fullDocument

            matchWitchCallback(docToMatch, (_filter: SubscriptionTicketFilter, tickets: SubscriptionTicket[]) => {
              const sanitized = sanitizeDoc(collection, docToMatch)
              tickets.forEach((ticket: SubscriptionTicket) => {
                try {
                  ticket.socket!.emit('collection-add', collection, sanitized)
                } catch (e) {
                  logger.warn({ err: e, collection, socketId: ticket.socket?.id }, 'failed to emit collection-add')
                }
              })
            })
          },
          update: () => {
            const docBefore = next.fullDocumentBeforeChange
            const docAfter = next.fullDocument

            sub.filters.forEach(({ filter, tickets }: { filter: SubscriptionTicketFilter, tickets: SubscriptionTicket[] }) => {
              const matchesBefore = this.matches(docBefore, filter)
              const matchesAfter = this.matches(docAfter, filter)

              const sanitizedAfter = sanitizeDoc(collection, docAfter)
              tickets.forEach((ticket: SubscriptionTicket) => {
                try {
                  if (matchesBefore && !matchesAfter) {
                    ticket.socket!.emit('collection-delete', collection, docBefore._id)
                  } else if (!matchesBefore && matchesAfter) {
                    ticket.socket!.emit('collection-add', collection, sanitizedAfter)
                  } else if (matchesBefore && matchesAfter) {
                    ticket.socket!.emit('collection-update', collection, sanitizedAfter)
                  }
                } catch (e) {
                  logger.warn({ err: e, collection, socketId: ticket.socket?.id }, 'failed to emit collection update/delete')
                }
              })
            })
          },
          delete: () => {
            const docId = next.documentKey?._id
            if (!docId) {
              logger.warn({ collection }, 'delete event missing documentKey._id')
              return
            }

            // fullDocumentBeforeChange may be null if pre-images aren't enabled.
            // For unfiltered subscriptions (empty filter), emit to all subscribers.
            // For filtered subscriptions, use the before-change doc to match if available.
            const docToMatch = next.fullDocumentBeforeChange

            sub.filters.forEach(({ filter, tickets }: { filter: SubscriptionTicketFilter, tickets: SubscriptionTicket[] }) => {
              const isEmptyFilter = Object.keys(filter).length === 0
              const matches = isEmptyFilter || (docToMatch && this.matches(docToMatch, filter))

              if (matches) {
                tickets.forEach((ticket: SubscriptionTicket) => {
                  try {
                    ticket.socket!.emit('collection-delete', collection, docId)
                  } catch (e) {
                    logger.warn({ err: e, collection, socketId: ticket.socket?.id }, 'failed to emit collection-delete')
                  }
                })
              }
            })
          },
        }

        if (actionByType[operationType as keyof typeof actionByType]) {
          actionByType[operationType as keyof typeof actionByType]()
        } else {
          logger.warn({ collection, operationType }, 'unhandled change stream operation type')
        }
      } catch (err) {
        logger.error({ err, collection }, 'error processing change stream event')
      }
    })
    sub.stream.on('error', (err: Error) => {
      logger.error({ err, collection }, 'change stream error')
    })
    this.streams.push(sub)
  }

  checkCollections() {
    const removed = this.lastCollections
      .filter(name => -1 === this.collections.indexOf(name))
    const added = this.collections
      .filter(name => -1 === this.lastCollections.indexOf(name))
    this.lastCollections = [...this.collections]

    const streamsToRemove = this.streams
      .filter(sub => -1 < removed.indexOf(sub.name))
    streamsToRemove.forEach(sub => {
      sub.stream.close()
    })

    added.forEach(collection => {
      this.createNewStream(collection)
    })
  }
}
