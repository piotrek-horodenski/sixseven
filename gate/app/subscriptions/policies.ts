import { SubscriptionTicketFilter } from './subscriptions'

/**
 * Deklaratywne polityki subskrypcji — "sekret ma dom" (etap 1).
 *
 * Każda subskrybowalna kolekcja MUSI mieć wpis w rejestrze. Kolekcje spoza
 * rejestru są odrzucane (secure default) — to automatycznie chroni prywatne
 * kolekcje games (moves, match_states, resolve_log, player_memory,
 * registrations), które NIGDY nie są wystawiane przez gate.
 *
 * Polityka może:
 *  - wymagać uprawnienia (requiredPermission) — brak = odmowa,
 *  - wstrzykiwać filtr po stronie SERWERA (filter) — łączony z filtrem klienta
 *    przez $and, więc klient nie jest w stanie poszerzyć zakresu (row-level),
 *  - sanityzować pola (sanitize) usuwane z każdego emitowanego dokumentu.
 *
 * Inwariant I1: treść chroniona polityką nie wycieka do subskrybenta bez prawa.
 */

export interface PolicyUser {
  _id: string
  permissions?: string[]
}

export interface CollectionPolicy {
  /** Wymagane uprawnienie do jakiejkolwiek subskrypcji tej kolekcji. */
  requiredPermission?: string
  /** Filtr serwera AND-owany z filtrem klienta (row-level). Domyślnie brak (cała kolekcja). */
  filter?: (user: PolicyUser) => SubscriptionTicketFilter
  /** Pola usuwane z każdego emitowanego dokumentu tej kolekcji. */
  sanitize?: string[]
}

export const collectionPolicies: Record<string, CollectionPolicy> = {
  // --- Kolekcje istniejące dziś (gate) ---
  // Administracja — gating uprawnieniem (jak dotychczas). Row-level own-vs-others
  // profilu użytkownika dojdzie później; na razie password/token zawsze zdejmowane.
  users:        { requiredPermission: 'manage-users', sanitize: ['password', 'token', 'sessions'] },
  roles:        { requiredPermission: 'manage-roles' },
  permissions:  { requiredPermission: 'manage-roles' },
  settings:     { requiredPermission: 'manage-settings' },
  // Publiczna paleta kolorów — bez ograniczeń.
  'color-presets': {},

  // ROW-LEVEL: pokój widoczny gdy PUBLICZNY i otwarty/zmatchowany, LUB gdy
  // subskrybent jest jego członkiem. $and z ewentualnym filtrem klienta nie
  // poszerza zakresu. (Ścieżka gościa w subscribe.handler używa węższego,
  // twardego filtra `{ 'members.id': guestId }` — patrz sekcja C.)
  rooms:        { filter: (subject) => ({ $or: [
    { visibility: 'public', status: { $ne: 'closed' } },
    { 'members.id': subject._id },
  ] } as unknown as SubscriptionTicketFilter) },

  // --- Kolekcje platformy gier (model danych z IMPLEMENTATION_PLAN.md) ---
  // Powstają fizycznie w etapie 2+ (pisze je games). Polityki definiujemy JUŻ
  // teraz, żeby row-level był wymuszany od chwili istnienia kolekcji — subskrypcja
  // pustej/nieistniejącej kolekcji zwraca po prostu zero dokumentów.
  //
  // ROW-LEVEL: gracz widzi mecze, w których UCZESTNICZY. Filtr { players: self }
  // korzysta z semantyki Mongo „element tablicy == wartość" (players to tablica
  // userId). $and z ewentualnym filtrem klienta nie pozwala poszerzyć zakresu.
  // matches NIE zawiera treści ruchów (te żyją w prywatnej `moves`, I1) — bezpieczne
  // do wystawienia uczestnikom bez sanityzacji. Wariant „mecz publiczny z okrojonymi
  // polami" (patrz matches.schema) świadomie odłożony do 2d/Etapu 3.
  matches:      { filter: (user) => ({ players: user._id } as unknown as SubscriptionTicketFilter) },
  // ROW-LEVEL: gracz widzi wyłącznie SWÓJ widok meczu. Nawet gdy klient podeśle
  // filtr { playerId: '<cudzy>' }, $and z { playerId: self } daje pustkę.
  match_views:  { filter: (user) => ({ playerId: user._id } as unknown as SubscriptionTicketFilter) },
  // ROW-LEVEL: tylko własne wpisy w kolejce matchmakingu.
  queue:        { filter: (user) => ({ userId: user._id } as unknown as SubscriptionTicketFilter) },
  // Publiczny ranking per gra.
  ratings:      {},

  // --- Kolekcje społeczności (Etap 4a/4b) ---
  // ROW-LEVEL: presence widoczne WYŁĄCZNIE znajomym. `visibleTo` to zdenormalizowana
  // lista userId zaakceptowanych znajomych (pisze presence.service). Obcy nie widzą
  // dokumentu wcale. Tryb niewidzialny degraduje status/currentMatchId przy zapisie
  // (sekret nie trafia do dokumentu). MVP: brak publicznego "bare status" (dług).
  presence:     { filter: (user) => ({ visibleTo: user._id } as unknown as SubscriptionTicketFilter) },
  // ROW-LEVEL: relacja widoczna tylko jej dwóm stronom (para znormalizowana a<b).
  friendships:  { filter: (user) => ({ $or: [ { a: user._id }, { b: user._id } ] } as unknown as SubscriptionTicketFilter) },
  // ROW-LEVEL: wiadomość widoczna członkom pokoju/meczu. `members` to snapshot
  // uprawnionych userId w chwili wysłania (pisze chat handler).
  messages:     { filter: (user) => ({ members: user._id } as unknown as SubscriptionTicketFilter) },
  // ROW-LEVEL (bramka Etapu 4): adnotacje pozytywne są publiczne; neutralne/negatywne
  // widzi TYLKO właściciel. Kolekcja należy do games (gate czyta raw driverem).
  annotations:  { filter: (user) => ({ $or: [ { sentiment: 'positive' }, { playerId: user._id } ] } as unknown as SubscriptionTicketFilter) },

  // UWAGA: moves, match_states, resolve_log, player_memory, registrations są
  // CELOWO nieobecne — pozostają prywatne dla games (default-deny je blokuje).
}

export function getPolicy(collection: string): CollectionPolicy | undefined {
  return collectionPolicies[collection]
}

/** Pola wrażliwe per kolekcja (dla sanitizeDoc). */
export const sensitiveFields: Record<string, string[]> = Object.fromEntries(
  Object.entries(collectionPolicies)
    .filter(([, p]) => p.sanitize && p.sanitize.length > 0)
    .map(([name, p]) => [name, p.sanitize as string[]]),
)

/**
 * Łączy filtr polityki (serwer) z filtrem klienta. $and gwarantuje, że klient
 * może zawęzić, ale nigdy poszerzyć zakres poza to, co dopuszcza polityka.
 */
export function mergeFilters(
  policyFilter: SubscriptionTicketFilter | undefined,
  clientFilter: SubscriptionTicketFilter | undefined,
): SubscriptionTicketFilter {
  const p = policyFilter && Object.keys(policyFilter).length > 0 ? policyFilter : null
  const c = clientFilter && Object.keys(clientFilter).length > 0 ? clientFilter : null

  if (p && c) {
    return { $and: [p, c] } as unknown as SubscriptionTicketFilter
  }
  return (p || c || {}) as SubscriptionTicketFilter
}
