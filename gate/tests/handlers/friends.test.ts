import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  createFriendsHandlers,
  normalizePair,
  FriendsStore,
  FriendshipRecord,
} from '../../app/socket-handlers/friends/friends.handler'

/** In-memory store friendships (klucz = znormalizowana para) — testy bez mongo. */
function makeStore(seed: FriendshipRecord[] = []): FriendsStore & { map: Map<string, FriendshipRecord> } {
  const map = new Map<string, FriendshipRecord>()
  const key = (a: string, b: string) => `${a}|${b}`
  seed.forEach(r => map.set(key(r.a, r.b), { ...r }))
  return {
    map,
    async find(a, b) {
      const r = map.get(key(a, b))
      return r ? { ...r } : null
    },
    async invite(a, b, invitedBy) {
      map.set(key(a, b), { a, b, status: 'invited', invitedBy })
    },
    async accept(a, b) {
      const r = map.get(key(a, b))
      if (r) r.status = 'accepted'
    },
    async remove(a, b) {
      map.delete(key(a, b))
    },
  }
}

function makePresence() {
  return {
    onFriendChange: vi.fn().mockResolvedValue(undefined),
    refreshStatus: vi.fn().mockResolvedValue(undefined),
  }
}

function deps(over: {
  store?: ReturnType<typeof makeStore>
  presence?: ReturnType<typeof makePresence>
  setInvisible?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    store: over.store ?? makeStore(),
    presence: over.presence ?? makePresence(),
    setInvisible: over.setInvisible ?? vi.fn().mockResolvedValue(undefined),
  }
}

function handlerFor(event: string, d: any) {
  const h = createFriendsHandlers(d).find(x => x.event === event)
  if (!h) throw new Error(`no handler ${event}`)
  return h
}

function userSocket(id: string) {
  return { emit: vi.fn(), id: 'sock', user: { _id: id } } as any
}

describe('normalizePair', () => {
  it('sorts the pair lexically so A↔B collapses to one document', () => {
    expect(normalizePair('u2', 'u1')).toEqual(['u1', 'u2'])
    expect(normalizePair('u1', 'u2')).toEqual(['u1', 'u2'])
  })
})

describe('friends:invite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an invited relation with invitedBy = me (from JWT, not payload)', async () => {
    const d = deps()
    const socket = userSocket('u2')
    await handlerFor('friends:invite', d).handler(socket, { userId: 'u1' })

    const rec = d.store.map.get('u1|u2')!
    expect(rec).toEqual({ a: 'u1', b: 'u2', status: 'invited', invitedBy: 'u2' })
    expect(socket.emit).toHaveBeenCalledWith('friends:invite-complete', { userId: 'u1' })
  })

  it('rejects inviting yourself', async () => {
    const d = deps()
    const socket = userSocket('u1')
    await handlerFor('friends:invite', d).handler(socket, { userId: 'u1' })
    expect(socket.emit).toHaveBeenCalledWith('friends:invite-error', { message: 'cannot invite yourself' })
  })

  it('rejects when an invite is already pending', async () => {
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'invited', invitedBy: 'u1' }])
    const socket = userSocket('u2')
    await handlerFor('friends:invite', deps({ store })).handler(socket, { userId: 'u1' })
    expect(socket.emit).toHaveBeenCalledWith('friends:invite-error', { message: 'invite already pending' })
  })

  it('rejects when already friends', async () => {
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'accepted', invitedBy: 'u1' }])
    const socket = userSocket('u2')
    await handlerFor('friends:invite', deps({ store })).handler(socket, { userId: 'u1' })
    expect(socket.emit).toHaveBeenCalledWith('friends:invite-error', { message: 'already friends' })
  })

  it('requires a userId', async () => {
    const socket = userSocket('u1')
    await handlerFor('friends:invite', deps()).handler(socket, {})
    expect(socket.emit).toHaveBeenCalledWith('friends:invite-error', { message: 'userId required' })
  })

  it('returns silently when not authenticated', async () => {
    const socket = { emit: vi.fn(), user: null } as any
    await handlerFor('friends:invite', deps()).handler(socket, { userId: 'u1' })
    expect(socket.emit).not.toHaveBeenCalled()
  })
})

describe('friends:accept', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts a pending invite from the OTHER party and triggers onFriendChange', async () => {
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'invited', invitedBy: 'u1' }])
    const presence = makePresence()
    const socket = userSocket('u2') // me = invited party
    await handlerFor('friends:accept', deps({ store, presence })).handler(socket, { userId: 'u1' })

    expect(store.map.get('u1|u2')!.status).toBe('accepted')
    expect(presence.onFriendChange).toHaveBeenCalledWith('u2', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('friends:accept-complete', { userId: 'u1' })
  })

  it('is idempotent: accepting an already-accepted relation acks without re-triggering onFriendChange', async () => {
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'accepted', invitedBy: 'u1' }])
    const presence = makePresence()
    const socket = userSocket('u2')
    await handlerFor('friends:accept', deps({ store, presence })).handler(socket, { userId: 'u1' })

    expect(socket.emit).toHaveBeenCalledWith('friends:accept-complete', { userId: 'u1' })
    expect(presence.onFriendChange).not.toHaveBeenCalled()
  })

  it('cannot accept a NON-EXISTENT invite', async () => {
    const presence = makePresence()
    const socket = userSocket('u2')
    await handlerFor('friends:accept', deps({ presence })).handler(socket, { userId: 'u1' })
    expect(socket.emit).toHaveBeenCalledWith('friends:accept-error', { message: 'no invite to accept' })
    expect(presence.onFriendChange).not.toHaveBeenCalled()
  })

  it('cannot accept YOUR OWN invite (invitedBy == me — identity from JWT)', async () => {
    // u1 invited u2; u1 tries to accept its own invite → rejected.
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'invited', invitedBy: 'u1' }])
    const presence = makePresence()
    const socket = userSocket('u1')
    await handlerFor('friends:accept', deps({ store, presence })).handler(socket, { userId: 'u2' })
    expect(socket.emit).toHaveBeenCalledWith('friends:accept-error', { message: 'no invite to accept' })
    expect(store.map.get('u1|u2')!.status).toBe('invited')
    expect(presence.onFriendChange).not.toHaveBeenCalled()
  })

  it('identity comes from socket.user, not the payload (cannot accept as someone else)', async () => {
    // Invite is u3→u2. A malicious u1 cannot accept it by naming u3 in the payload,
    // because `me` is taken from socket.user (u1), and there is no u1↔u3 invite.
    const store = makeStore([{ a: 'u2', b: 'u3', status: 'invited', invitedBy: 'u3' }])
    const socket = userSocket('u1')
    await handlerFor('friends:accept', deps({ store })).handler(socket, { userId: 'u3' })
    expect(socket.emit).toHaveBeenCalledWith('friends:accept-error', { message: 'no invite to accept' })
    expect(store.map.get('u2|u3')!.status).toBe('invited') // untouched
  })
})

describe('friends:remove', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes the relation and refreshes presence for both parties', async () => {
    const store = makeStore([{ a: 'u1', b: 'u2', status: 'accepted', invitedBy: 'u1' }])
    const presence = makePresence()
    const socket = userSocket('u2')
    await handlerFor('friends:remove', deps({ store, presence })).handler(socket, { userId: 'u1' })

    expect(store.map.has('u1|u2')).toBe(false)
    expect(presence.onFriendChange).toHaveBeenCalledWith('u2', 'u1')
    expect(socket.emit).toHaveBeenCalledWith('friends:remove-complete', { userId: 'u1' })
  })
})

describe('presence:set-invisible', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists the flag and re-evaluates the presence doc', async () => {
    const presence = makePresence()
    const setInvisible = vi.fn().mockResolvedValue(undefined)
    const socket = userSocket('u1')
    await handlerFor('presence:set-invisible', deps({ presence, setInvisible })).handler(socket, { invisible: true })

    expect(setInvisible).toHaveBeenCalledWith('u1', true)
    expect(presence.refreshStatus).toHaveBeenCalledWith('u1')
    expect(socket.emit).toHaveBeenCalledWith('presence:set-invisible-complete', { invisible: true })
  })

  it('rejects a non-boolean invisible value', async () => {
    const socket = userSocket('u1')
    await handlerFor('presence:set-invisible', deps()).handler(socket, { invisible: 'yes' })
    expect(socket.emit).toHaveBeenCalledWith('presence:set-invisible-error', { message: 'invisible must be a boolean' })
  })
})
