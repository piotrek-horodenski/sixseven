/**
 * presence.service — czysta, wstrzykiwalna logika obecności (4a).
 *
 * Odpowiada za jeden dokument `presence` per użytkownik: agregat sesji
 * multi-device, listę uprawnionych odbiorców (`visibleTo` = accepted friends) i
 * degradację trybu niewidzialnego. WSZYSTKIE zależności są wstrzykiwane (store
 * presence, „czy user invisible", „lista accepted-friend-ids", zegar) — rdzeń
 * testuje się bez mongo i bez sieci.
 *
 * Multi-device (kluczowy inwariant): user jest online, dopóki żyje ≥1 socket.
 * Utrzymujemy licznik żywych socketów per userId (Map). Zamknięcie JEDNEJ z
 * wielu sesji NIE degraduje do offline — dopiero zamknięcie OSTATNIEJ woła
 * `goOffline` (usunięcie dokumentu presence).
 *
 * Tryb niewidzialny (Decyzja projektowa 3): gdy `isInvisible(userId)` → zapis
 * degraduje `status` do 'online' i zeruje `currentMatchId`. Sekret nie trafia
 * nawet do dokumentu.
 */

export type PresenceStatus = 'online' | 'lobby' | 'match'

export interface PresenceRecord {
  userId: string
  status: PresenceStatus
  lastSeen: number
  currentMatchId: string | null
  visibleTo: string[]
  updatedAt: number
}

/** Abstrakcja składu presence — pozwala testować serwis bez mongo. */
export interface PresenceStore {
  /** Upsert pełnego stanu obecności (tworzy dokument jeśli brak). */
  upsert(userId: string, fields: {
    status: PresenceStatus
    currentMatchId: string | null
    visibleTo: string[]
    lastSeen: number
    updatedAt: number
  }): Promise<void>
  /** Odczyt bieżącego dokumentu (null gdy offline). */
  get(userId: string): Promise<PresenceRecord | null>
  /**
   * Odśwież WYŁĄCZNIE `visibleTo` istniejącego dokumentu (bez upsertu — offline
   * user nie dostaje zmartwychwstałego presence po zmianie znajomych).
   */
  updateVisibleTo(userId: string, visibleTo: string[], updatedAt: number): Promise<void>
  /** OFFLINE = brak dokumentu: usuwamy go po ostatniej sesji. */
  setOffline(userId: string): Promise<void>
}

export interface PresenceDeps {
  store: PresenceStore
  /** Czy użytkownik ma włączony tryb niewidzialny (`users.privacy.invisible`). */
  isInvisible: (userId: string) => Promise<boolean>
  /** userId znajomych ze statusem `accepted` (obie strony relacji). */
  listAcceptedFriendIds: (userId: string) => Promise<string[]>
  /** Zegar — wstrzykiwalny dla determinizmu testów. */
  now?: () => number
}

export function createPresenceService(deps: PresenceDeps) {
  const now = deps.now ?? (() => Date.now())
  // Licznik żywych socketów per userId. Źródło prawdy dla „online" — multi-device.
  const liveSessions = new Map<string, number>()
  // Warstwa „activity": bieżąca aktywność usera (lobby/match) ustawiana przez
  // zdarzenia rooms (gate socket) i cykl życia socketu meczu (token match).
  // Przeżywa reconnect (onConnect ją odtwarza) i jest zdejmowana przez
  // clearActivity → powrót do 'online'. Bez wpisu = zwykłe 'online'.
  const activity = new Map<string, { status: PresenceStatus; matchId: string | null }>()

  /**
   * Upsert obecności dla danego statusu. Zawsze przelicza `visibleTo` (accepted
   * friends). Tryb niewidzialny degraduje status → 'online' i zeruje matchId.
   */
  async function setStatus(
    userId: string,
    status: PresenceStatus,
    currentMatchId: string | null = null,
  ): Promise<void> {
    const [invisible, visibleTo] = await Promise.all([
      deps.isInvisible(userId),
      deps.listAcceptedFriendIds(userId),
    ])
    const ts = now()

    // Sekret ma dom: gdy invisible, „w meczu X" nie wychodzi nawet do dokumentu.
    const effectiveStatus: PresenceStatus = invisible ? 'online' : status
    const effectiveMatchId: string | null = invisible ? null : currentMatchId

    await deps.store.upsert(userId, {
      status: effectiveStatus,
      currentMatchId: effectiveMatchId,
      visibleTo,
      lastSeen: ts,
      updatedAt: ts,
    })
  }

  /** Przelicz `visibleTo` po zmianie znajomych (tylko jeśli user jest online). */
  async function refreshVisibleTo(userId: string): Promise<void> {
    const visibleTo = await deps.listAcceptedFriendIds(userId)
    await deps.store.updateVisibleTo(userId, visibleTo, now())
  }

  /**
   * Ponownie zastosuj logikę statusu do BIEŻĄCEGO dokumentu (np. po zmianie
   * `privacy.invisible`). No-op gdy user offline. Uwaga: jeśli status był zapisany
   * podczas invisible=true (zdegradowany do 'online'), wyłączenie trybu nie
   * odtworzy 'match' — prawdziwy status wróci przy najbliższej realnej tranzycji.
   */
  async function refreshStatus(userId: string): Promise<void> {
    const current = await deps.store.get(userId)
    if (!current) return
    await setStatus(userId, current.status, current.currentMatchId)
  }

  /** Po zamknięciu OSTATNIEJ sesji: OFFLINE = usunięcie dokumentu. */
  async function goOffline(userId: string): Promise<void> {
    await deps.store.setOffline(userId)
  }

  /** Po accept/remove: odśwież visibleTo dla OBU stron relacji. */
  async function onFriendChange(userIdA: string, userIdB: string): Promise<void> {
    await Promise.all([refreshVisibleTo(userIdA), refreshVisibleTo(userIdB)])
  }

  /** Liczba żywych socketów danego usera (0 = offline). Dla testów/diagnostyki. */
  function sessionCount(userId: string): number {
    return liveSessions.get(userId) ?? 0
  }

  /**
   * Ustaw aktywność usera (lobby/match) + zapisz do dokumentu, jeśli online.
   * Zapamiętana w mapie, by przeżyć reconnect (onConnect ją odtwarza). Offline
   * user (brak sesji) nie dostaje zmartwychwstałego presence — tylko zapis intencji.
   */
  async function setActivity(
    userId: string,
    status: 'lobby' | 'match',
    matchId: string | null = null,
  ): Promise<void> {
    activity.set(userId, { status, matchId })
    if (sessionCount(userId) > 0) {
      await setStatus(userId, status, matchId)
    }
  }

  /**
   * Zdejmij aktywność (koniec/opuszczenie gry). Jeśli user wciąż online → 'online';
   * jeśli offline (brak sesji) → no-op (goOffline i tak usunął dokument).
   */
  async function clearActivity(userId: string): Promise<void> {
    activity.delete(userId)
    if (sessionCount(userId) > 0) {
      await setStatus(userId, 'online')
    }
  }

  /**
   * Nowy socket usera. Pierwsza sesja → user staje się online. Kolejne sesje
   * (multi-device) tylko inkrementują licznik.
   */
  async function onConnect(userId: string): Promise<void> {
    const next = sessionCount(userId) + 1
    liveSessions.set(userId, next)
    if (next === 1) {
      // Odtwórz aktywność (lobby/match) po reconnect; inaczej zwykłe 'online'.
      const act = activity.get(userId)
      await setStatus(userId, act?.status ?? 'online', act?.matchId ?? null)
    }
  }

  /**
   * Zamknięcie socketu usera. Offline DOPIERO po zamknięciu OSTATNIEJ sesji.
   * Zamknięcie jednej z wielu sesji ≠ offline (multi-device).
   */
  async function onDisconnect(userId: string): Promise<void> {
    const current = sessionCount(userId)
    if (current <= 0) return
    const next = current - 1
    if (next <= 0) {
      liveSessions.delete(userId)
      // Pełny offline: zapomnij aktywność, by reconnect nie wskrzesił starego lobby/match.
      activity.delete(userId)
      await goOffline(userId)
    } else {
      liveSessions.set(userId, next)
    }
  }

  return {
    setStatus,
    setActivity,
    clearActivity,
    refreshVisibleTo,
    refreshStatus,
    goOffline,
    onFriendChange,
    onConnect,
    onDisconnect,
    sessionCount,
  }
}

export type PresenceService = ReturnType<typeof createPresenceService>

/**
 * Produkcyjny singleton (leniwy) — JEDNA instancja współdzielona przez friends
 * handler i lifecycle w app.class.ts (spójny licznik sesji multi-device).
 * Zależności (modele mongoose, App) czytane LENIWIE przez require, żeby import
 * tego modułu w testach nie odpalał bootstrapu App ani walidacji env.
 */
let singleton: PresenceService | null = null

export function getPresenceService(): PresenceService {
  if (singleton) return singleton

  // App MUSI być rozwiązywany PRZY KAŻDYM wywołaniu (nie przy konstrukcji
  // singletona): friends/index.ts woła getPresenceService() na etapie ładowania
  // modułu, gdy app.ts jest jeszcze w trakcie ewaluacji (cykliczny import) i
  // `App` byłby `undefined` na zawsze zamrożony w domknięciu. Leniwy require w
  // getModel odracza to do czasu wywołania handlera, gdy App jest już gotowe.
  function getModel(name: string) {
    const { App } = require('../app') as typeof import('../app')
    const m = App.models.find((x: { name: string }) => x.name === name)?.model
    if (!m) throw new Error(`${name} model not registered`)
    return m
  }

  const store: PresenceStore = {
    async upsert(userId, fields) {
      await getModel('presence').updateOne(
        { userId },
        { $set: { userId, ...fields } },
        { upsert: true },
      )
    },
    async get(userId) {
      const doc: any = await getModel('presence').findOne({ userId })
      if (!doc) return null
      return {
        userId: doc.userId,
        status: doc.status,
        lastSeen: doc.lastSeen ?? 0,
        currentMatchId: doc.currentMatchId ?? null,
        visibleTo: doc.visibleTo ?? [],
        updatedAt: doc.updatedAt ?? 0,
      }
    },
    async updateVisibleTo(userId, visibleTo, updatedAt) {
      // Bez upsertu: offline user (brak dokumentu) nie zostaje zmartwychwstały.
      await getModel('presence').updateOne({ userId }, { $set: { visibleTo, updatedAt } })
    },
    async setOffline(userId) {
      await getModel('presence').deleteOne({ userId })
    },
  }

  async function isInvisible(userId: string): Promise<boolean> {
    const u: any = await getModel('users').findById(userId, { privacy: 1 })
    return !!(u && u.privacy && u.privacy.invisible)
  }

  async function listAcceptedFriendIds(userId: string): Promise<string[]> {
    const docs: any[] = await getModel('friendships').find({
      status: 'accepted',
      $or: [{ a: userId }, { b: userId }],
    })
    return docs.map(d => (d.a === userId ? d.b : d.a))
  }

  singleton = createPresenceService({ store, isInvisible, listAcceptedFriendIds })
  return singleton
}
