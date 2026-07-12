import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createPresenceService,
  PresenceStore,
  PresenceRecord,
} from '../../app/services/presence.service'

/** In-memory store presence — testy serwisu bez mongo. */
function makeStore(seed: PresenceRecord[] = []): PresenceStore & { docs: Map<string, PresenceRecord> } {
  const docs = new Map<string, PresenceRecord>()
  seed.forEach(d => docs.set(d.userId, { ...d }))
  return {
    docs,
    async upsert(userId, fields) {
      docs.set(userId, { userId, ...fields })
    },
    async get(userId) {
      const d = docs.get(userId)
      return d ? { ...d } : null
    },
    async updateVisibleTo(userId, visibleTo, updatedAt) {
      // Bez upsertu: offline user (brak dokumentu) nie zmartwychwstaje.
      const d = docs.get(userId)
      if (d) { d.visibleTo = visibleTo; d.updatedAt = updatedAt }
    },
    async setOffline(userId) {
      docs.delete(userId)
    },
  }
}

function makeService(over: {
  store?: ReturnType<typeof makeStore>
  invisible?: Set<string>
  friends?: Record<string, string[]>
  now?: () => number
} = {}) {
  const store = over.store ?? makeStore()
  const invisible = over.invisible ?? new Set<string>()
  const friends = over.friends ?? {}
  const svc = createPresenceService({
    store,
    isInvisible: async (userId) => invisible.has(userId),
    listAcceptedFriendIds: async (userId) => friends[userId] ?? [],
    now: over.now ?? (() => 1000),
  })
  return { svc, store, invisible, friends }
}

describe('presence.service — setStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts presence with visibleTo = accepted friends and stamps lastSeen/updatedAt', async () => {
    const { svc, store } = makeService({ friends: { u1: ['u2', 'u3'] }, now: () => 4242 })
    await svc.setStatus('u1', 'lobby')

    const doc = store.docs.get('u1')!
    expect(doc.status).toBe('lobby')
    expect(doc.visibleTo).toEqual(['u2', 'u3'])
    expect(doc.currentMatchId).toBeNull()
    expect(doc.lastSeen).toBe(4242)
    expect(doc.updatedAt).toBe(4242)
  })

  it('keeps currentMatchId for a normal (visible) match status', async () => {
    const { svc, store } = makeService({ friends: { u1: ['u2'] } })
    await svc.setStatus('u1', 'match', 'match-77')
    const doc = store.docs.get('u1')!
    expect(doc.status).toBe('match')
    expect(doc.currentMatchId).toBe('match-77')
  })

  it('invisible mode degrades status to online and strips currentMatchId (secret never hits the doc)', async () => {
    const { svc, store } = makeService({ invisible: new Set(['u1']), friends: { u1: ['u2'] } })
    await svc.setStatus('u1', 'match', 'match-77')
    const doc = store.docs.get('u1')!
    expect(doc.status).toBe('online')
    expect(doc.currentMatchId).toBeNull()
    // visibleTo nadal liczone — znajomi widzą „online", tylko bez szczegółów meczu.
    expect(doc.visibleTo).toEqual(['u2'])
  })
})

describe('presence.service — friend changes', () => {
  it('refreshVisibleTo recomputes visibleTo on the existing doc only', async () => {
    const store = makeStore([{ userId: 'u1', status: 'online', lastSeen: 1, currentMatchId: null, visibleTo: ['u2'], updatedAt: 1 }])
    const friends: Record<string, string[]> = { u1: ['u2', 'u3'] }
    const { svc } = makeService({ store, friends, now: () => 9 })
    await svc.refreshVisibleTo('u1')
    expect(store.docs.get('u1')!.visibleTo).toEqual(['u2', 'u3'])
    expect(store.docs.get('u1')!.updatedAt).toBe(9)
  })

  it('refreshVisibleTo does NOT resurrect an offline user (no doc)', async () => {
    const store = makeStore()
    const { svc } = makeService({ store, friends: { u1: ['u2'] } })
    await svc.refreshVisibleTo('u1')
    expect(store.docs.has('u1')).toBe(false)
  })

  it('onFriendChange refreshes both parties', async () => {
    const store = makeStore([
      { userId: 'u1', status: 'online', lastSeen: 1, currentMatchId: null, visibleTo: [], updatedAt: 1 },
      { userId: 'u2', status: 'online', lastSeen: 1, currentMatchId: null, visibleTo: [], updatedAt: 1 },
    ])
    const { svc } = makeService({ store, friends: { u1: ['u2'], u2: ['u1'] } })
    await svc.onFriendChange('u1', 'u2')
    expect(store.docs.get('u1')!.visibleTo).toEqual(['u2'])
    expect(store.docs.get('u2')!.visibleTo).toEqual(['u1'])
  })
})

describe('presence.service — multi-device session counting', () => {
  it('first connect brings the user online; closing 1 of 2 sessions does NOT go offline', async () => {
    const { svc, store } = makeService({ friends: { u1: ['u2'] } })

    await svc.onConnect('u1') // device A — first session → online
    expect(svc.sessionCount('u1')).toBe(1)
    expect(store.docs.get('u1')!.status).toBe('online')

    await svc.onConnect('u1') // device B — second session (multi-device)
    expect(svc.sessionCount('u1')).toBe(2)

    await svc.onDisconnect('u1') // close device A — STILL online
    expect(svc.sessionCount('u1')).toBe(1)
    expect(store.docs.has('u1')).toBe(true)

    await svc.onDisconnect('u1') // close device B — last session → offline
    expect(svc.sessionCount('u1')).toBe(0)
    expect(store.docs.has('u1')).toBe(false)
  })

  it('onDisconnect on an unknown/zero-count user is a no-op', async () => {
    const { svc, store } = makeService()
    await svc.onDisconnect('ghost')
    expect(svc.sessionCount('ghost')).toBe(0)
    expect(store.docs.has('ghost')).toBe(false)
  })
})

describe('presence.service — refreshStatus (invisible toggle re-eval)', () => {
  it('re-applies invisible degradation to the current doc', async () => {
    const store = makeStore([{ userId: 'u1', status: 'match', lastSeen: 1, currentMatchId: 'match-9', visibleTo: [], updatedAt: 1 }])
    const invisible = new Set<string>()
    const { svc } = makeService({ store, invisible, friends: { u1: [] } })

    // Włącz tryb niewidzialny, potem odśwież → currentMatchId zdjęte, status online.
    invisible.add('u1')
    await svc.refreshStatus('u1')
    expect(store.docs.get('u1')!.status).toBe('online')
    expect(store.docs.get('u1')!.currentMatchId).toBeNull()
  })

  it('is a no-op for an offline user', async () => {
    const store = makeStore()
    const { svc } = makeService({ store })
    await svc.refreshStatus('u1')
    expect(store.docs.has('u1')).toBe(false)
  })
})
