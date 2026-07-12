# ETAP 4 (4a+4b+4c) — kontrakt integracyjny (źródło prawdy)

> Spina równoległą pracę nad warstwą **społeczności**: 4a presence+znajomi, 4b czat+profile+adnotacje(odczyt), 4c konwersja gościa.
> Wzorzec jak w `ETAP2D_CONTRACT.md`: rozłączne obszary, agenci tworzą **nowe pliki**, NIE dotykają współdzielonych „hotspotów" — zamiast tego **wypisują w raporcie** dokładnie co dołożyć; **integrator** wpina. Trzymaj nazwy 1:1.
> Zasady: żaden agent NIE robi operacji git. Testów z bazą / Dockera nie odpalamy w sandboksie (robi Piotr). Wszystko co się da — wstrzykiwalne (fetch/klienci/store) i testowalne bez sieci.

## Konwencje (istniejące, nie zmieniać)
- Socket: klient emituje `X`, gate odpowiada `X-complete { ... }` albo `X-error { message }`.
- Subskrypcja: `subscribe { tickets: [{ collection, filter }] }`; serwer emituje `collection-init|add|update|delete (collection, payload)`. Klient filtruje po nazwie kolekcji (patrz `web/src/composables/useCollection.ts`). **Bezpieczeństwo row-level jest po stronie serwera** — klient przekazuje pusty filtr, gate AND-uje własną politykę; klient może tylko ZAWĘZIĆ, nigdy poszerzyć.
- Tożsamość w handlerze: `socket.user` (pełny user, `_id` to ObjectId → **stringuj** `String(user._id)`), `socket.guest {guestId, roomId}`, `socket.match {matchId, playerId}`. **playerId/identyfikator ZAWSZE z tokenu (JWT/scoped), NIGDY z payloadu.**
- Gate→games: nagłówek `x-sixseven-internal`, `POST GAMES_URL/command/*`. Klient: `gate/app/services/games-client.ts`.
- Handlery gate: preferuj **factory** `create<Feature>Handlers(deps)` zwracającą `HandlerObject[]` (jak `createRoomsHandlers`), produkcyjne `deps` wiążesz w `index.ts` folderu. Testowalne z wstrzykniętymi fake'ami.
- Polityki subskrypcji: `gate/app/subscriptions/policies.ts`, `collectionPolicies` (default-DENY: kolekcja spoza mapy = niewidoczna). Kształt: `{ requiredPermission?, filter?: (user)=>MongoFilter, sanitize?: string[] }`.
- i18n (Fala 3, DZIAŁA): nowy ns = `web/src/i18n/locales/pl/<ns>.ts` (`export default {...}`) + `en/<ns>.ts` (`import type pl from '../pl/<ns>'; const x: typeof pl = {...}; export default x`). W komponentach `$t('ns.key')`; w store/composables `import { t } from '@/i18n'`.

## Decyzje projektowe tej fali (uzasadnienie — czytaj, zanim zaczniesz)

1. **Widoczność relacyjna przez denormalizację `visibleTo` / `members` (zamiast rozbudowy mechanizmu polityk).** Istniejąca polityka `filter: (user)=>MongoFilter` wybiera WIERSZE po `user._id` i nie ma dostępu do bazy (nie policzy „moich znajomych" async). Dla „presence widoczne tylko znajomym" i „wiadomości tylko dla członków pokoju/meczu" zapisujemy na dokumencie tablicę uprawnionych odbiorców i filtrujemy po niej: `presence.visibleTo: [userId]`, `messages.members: [userId]`. To działa z obecnym mechanizmem bez zmian w `subscriptions.ts`.
2. **4a MVP: presence widoczne WYŁĄCZNIE znajomym (całość dokumentu), nie „bare status publiczny".** Plan wspomina „bare status public, details for friends", ale to wymagałoby field-level-conditional (nieobsługiwane bez rozbudowy). MVP jest bardziej prywatny (obcy nie widzą Cię wcale) i pokrywa realny deliverable 4a (lista znajomych + ich status live). Publiczny bare-status = świadomy dług (rozbudowa mechanizmu później).
3. **Tryb niewidzialny (decyzja Piotra):** pref usera `privacy.invisible`. Gdy `true`, `presence.service` przy zapisie **nie ujawnia `currentMatchId`** i degraduje `status` do `online` (znajomi widzą „online", nie „w meczu X"). Sekret nie trafia nawet do dokumentu.
4. **Adnotacje (4b) — domykamy ODCZYT + widoczność.** Kolekcja `annotations` należy do `games` (exposed). Widoczność egzekwuje POLITYKA gate: `{ $or: [{ sentiment:'positive' }, { playerId: user._id }] }` — pozytywne publiczne, neutralne/negatywne tylko właściciel. To bezpośrednio realizuje **bramkę Etapu 4**. Ścieżkę zapisu `/annotate` robimy MINIMALNĄ (bez walidacji z manifestu — to Etap 5), żeby testy widoczności miały dane.
5. **4c ograniczenie (prawdomównie):** trwałe „cookie sesji gościa z Etapu 1" NIE istnieje w kodzie — `guestId` żyje tylko w JWT gościa (24h) + `matches.guestIds[]` + `rooms.members`. MVP 4c podpina mecze **bieżącego zweryfikowanego `guestId`** z okna 7 dni. Generalizacja „ten sam cookie przez wiele sesji/dni" wymaga trwałych rekordów sesji gościa (dług Etapu 1) — **UDOKUMENTOWANE jako follow-up**, nie budujemy tu. Anti-hijack (guestId z tokenu, nie z payloadu), zero ELO i okno 7 dni — budujemy.

---

## OBSZAR A1 — gate: presence + friends (4a)  [skill: back]

Wszystko NOWE, plus raport wiring. NIE edytuj: `models/index.ts`, `policies.ts`, `socket-handlers/index.ts`, `app.class.ts`, disconnect handler — **raportuj** wstawki.

### Kolekcje (gate pisze)
`gate/app/models/presence.schema.ts` → `model('presence', schema)`:
```
{
  userId: String (unikat, index),
  status: 'online' | 'lobby' | 'match',   // agregat sesji; degradowane do 'online' gdy invisible
  lastSeen: Number,
  currentMatchId: String | null,           // pomijane gdy invisible
  visibleTo: [String],                     // userId znajomych (accepted) — filtr polityki
  updatedAt: Number
}
```
`gate/app/models/friendships.schema.ts` → `model('friendships', schema)`:
```
{
  a: String,  // userId inicjatora (String(_id))
  b: String,  // userId adresata
  status: 'invited' | 'accepted',
  createdAt: Number, updatedAt: Number
}
// index unikatowy na nieuporządkowanej parze: przechowuj parę znormalizowaną (a<b leksykalnie) LUB
// index { a:1, b:1 } unique + zawsze zapisuj a=min(x,y), b=max(x,y); relacja kierunku (kto zaprosił)
// trzymaj osobnym polem `invitedBy: String` jeśli potrzebne do UI.
```
> Uwaga: aby uniknąć duplikatów (A→B i B→A), **normalizuj parę** `[a,b] = [min,max]` i dodaj `invitedBy` do rozróżnienia kierunku zaproszenia. Unikat `{ a:1, b:1 }`.

### presence.service (`gate/app/services/presence.service.ts`)
Czysta logika, wstrzykiwalne zależności (model presence, funkcja „czy user invisible", funkcja „lista accepted-friend-ids"). Funkcje:
- `async setStatus(userId, status, currentMatchId?)` — upsert presence: policz `visibleTo` = accepted friends; jeśli user invisible → `status='online'`, `currentMatchId=null`; `lastSeen=updatedAt=Date.now()`.
- `async refreshVisibleTo(userId)` — przelicz `visibleTo` po zmianie znajomych (woła po accept/remove dla OBU userów).
- `async goOffline(userId)` — po zamknięciu OSTATNIEJ sesji (grace period): usuń/oznacz offline. Agregat sesji: user online, dopóki `users.sessions[]` (albo licznik żywych socketów) > 0 — zaimplementuj licznik żywych socketów per userId w serwisie (Map) LUB czytaj `users.sessions`. **Multi-device: zamknięcie jednej sesji ≠ offline.**
- `async onFriendChange(userIdA, userIdB)` — refreshVisibleTo dla obu.
Invisible pref: przechowywane na userze — dodaj do `users.schema.ts` pole `privacy: { invisible: Boolean, default:false }` (**RAPORTUJ tę zmianę schematu users — integrator lub Ty w osobnym pliku? users.schema.ts jest współdzielony z A2 (który go NIE rusza) → Ty możesz je dodać, ale ZGŁOŚ w raporcie**). Komenda ustawienia: `presence:set-invisible { invisible }` w friends handlerze (albo osobno) → zapis na userze + `refreshVisibleTo`/`setStatus`.

### Handlery (`gate/app/socket-handlers/friends/{friends.handler.ts,index.ts}`)
Factory `createFriendsHandlers(deps)` → `HandlerObject[]`. `socket.user` wymagany (`if(!user) return`). `me = String(user._id)`.
- `friends:invite { userId }` → `friends:invite-complete { userId }` | `friends:invite-error { message }`. Utwórz/aktualizuj friendship `status='invited'`, `invitedBy=me`. Odrzuć: samego siebie, gdy już accepted/invited. Nie zaufaj payloadowi co do `me`.
- `friends:accept { userId }` → `friends:accept-complete { userId }`. **Idempotentny**. Akceptuje TYLKO gdy istnieje `invited` gdzie `invitedBy != me` i `me` jest stroną. Po accept: `status='accepted'`, `presence.service.onFriendChange(me, other)`.
- `friends:remove { userId }` → `friends:remove-complete { userId }`. Usuwa relację (i invited, i accepted). Potem `onFriendChange`.
- `presence:set-invisible { invisible }` → `presence:set-invisible-complete { invisible }`. Zapis na userze + odśwież presence.
Testy (`gate/tests/handlers/friends.test.ts`, `gate/tests/services/presence.service.test.ts`): accept idempotentny; nie da się zaakceptować cudzego/nieistniejącego zaproszenia (me z JWT); invisible degraduje currentMatchId; multi-device (2 sesje, zamknięcie 1 ≠ offline).

### RAPORT A1 (dla integratora)
- `models/index.ts`: `{ name:'presence', model: Presence }`, `{ name:'friendships', model: Friendship }`.
- `policies.ts`:
  ```
  presence:     { filter: (user) => ({ visibleTo: user._id }) },
  friendships:  { filter: (user) => ({ $or: [ { a: user._id }, { b: user._id } ] }) },
  ```
- `socket-handlers/index.ts`: `...friendsHandlers`.
- Lifecycle (`app.class.ts` + `general/disconnect.handler.ts`): gdzie wołać `presence.service.setStatus(userId,'online')` (po `session` na connect usera), inkrement/dekrement licznika sesji, `goOffline` po ostatnim disconnect. Podaj DOKŁADNE miejsca (numery linii/funkcje) i sygnatury.
- Wejście do lobby/meczu → `status='lobby'/'match'` + `currentMatchId`: wskaż, który istniejący event to wyzwala (np. w `rooms`/`games` handlerach) — jeśli brak taniego haka, zaproponuj minimalny (RAPORT, integrator zdecyduje).
- `users.schema.ts`: dodane pole `privacy.invisible` (zgłoś dokładny diff).

---

## OBSZAR A2 — gate: chat + profile:get + guest-convert + games-client (4b/4c)  [skill: back]

NOWE pliki + `games-client.ts` (A2 jest JEDYNYM edytorem tego pliku). NIE edytuj: `models/index.ts` (messages już zarejestrowany), `policies.ts`, `socket-handlers/index.ts`, `general/register.handler.ts` — RAPORTUJ wstawki.

### Reshape messages (`gate/app/models/messages.schema.ts` — A2 właściciel)
Zastąp stary kształt (`signedBy/userId/text/dest`) nowym:
```
{
  scope: 'room' | 'match',
  scopeId: String (index),          // roomId albo matchId
  authorId: String,                 // String(user._id)
  authorNick: String,               // denorm do wyświetlenia
  text: String,                     // maks długość egzekwowana serwerowo
  members: [String],                // userId uprawnionych do odczytu (snapshot w chwili wysłania)
  ts: Number, createdAt: Number
}
// index { scope:1, scopeId:1, ts:1 }
```
> `members` = aktualni członkowie-`user` pokoju/meczu w chwili wysłania (goście czatu przez token match — patrz niżej; MVP: czat tylko dla `socket.user`, goście czytają przez subskrypcję match tokenem — DOŁÓŻ `match.playerId` do members jeśli obecny). Dla MVP: members = userIds pokoju/meczu.

### Chat handler (`gate/app/socket-handlers/chat/{chat.handler.ts,index.ts}`)
Factory `createChatHandlers(deps)` (deps: model messages, funkcja weryfikacji członkostwa w pokoju/meczu — pokój z modelu `rooms`, mecz przez `games-client.getMatch`). `socket.user` LUB `socket.match`.
- `chat:send { scope, scopeId, text }` → `chat:send-complete { id }` | `chat:send-error { message }`.
  - Walidacja: `text` niepusty, `len ≤ MAX_CHAT_LEN` (config, np. 500) — **serwerowo** (nie tylko UI). Trim.
  - **Rate-limit** serwerowy per user (np. ≤ N wiadomości / okno; użyj wzorca `socket-rate-limit.ts` albo własny licznik w deps). Przekroczenie → `-error { message:'rate_limited' }`.
  - Członkostwo: nadawca MUSI być członkiem `scopeId` (pokój: `rooms.members.id == me`; mecz: `me ∈ players∪guestIds` via getMatch). Inaczej `-error`.
  - `members` = snapshot członków (userIds; dołóż playerId gościa jeśli match-scope). Zapis + emit przez subskrypcję (nie musisz emitować ręcznie — subskrypcja `messages` roznosi).
Polityka `messages`: `{ filter: (user) => ({ members: user._id }) }`.
Testy: rate-limit i limit długości egzekwowane serwerowo; nie-członek nie wyśle; nie-członek nie widzi (case polityki).

### profile:get (`gate/app/socket-handlers/profile-public/{profile.handler.ts,index.ts}`)
> UWAGA: istnieje już `general/profile.handler.ts` (UPDATE własnego profilu). To OSOBNY handler (odczyt cudzego profilu). Nowy folder, inna nazwa eventu.
Factory `createProfileHandlers(deps)` (deps: model users, `games-client.playerHistory`). `socket.user` (odczyt publiczny — dowolny zalogowany).
- `profile:get { userId }` → `profile:get-complete { profile: { userId, display, badges?, history } }` | `profile:get-error`.
  - `display` = sanityzowany publiczny profil z users (`profile.display || username`; NIE ujawniaj email/roles/sessions).
  - `history` = wynik `games-client.playerHistory(userId)` (patrz A3 kontrakt endpointu). Sekcja odznak = adnotacje idą przez SUBSKRYPCJĘ `annotations` po stronie web (polityka filtruje), NIE przez ten RPC — tu tylko historia meczów + display.
Polityka `annotations` (RAPORT): `{ filter: (user) => ({ $or: [ { sentiment:'positive' }, { playerId: user._id } ] }) }`.

### guest-convert (`gate/app/socket-handlers/guest-convert/{guest-convert.handler.ts,index.ts}`)
Factory `createGuestConvertHandlers(deps)` (deps: model users, funkcja rejestracji/hashowania hasła — reużyj logiki z `register.handler`, wydziel wspólny helper LUB zawołaj przez deps; `games-client.attachGuest`, konfiguracja limitu). **`socket.guest` wymagany.**
- `guest:convert { username, email, password }` → `guest:convert-complete { userData }` (kształt jak `login-complete`: user + token nowej sesji) | `guest:convert-error { message }`.
  - Utwórz konto (walidacja jak register: unikat username/email, hash hasła, seed permissions/roles jak zwykły user, `sessions[]` z nowym tokenem).
  - `guestId = socket.guest.guestId` (**z tokenu, nie z payloadu**).
  - Zawołaj `games-client.attachGuest({ guestId, userId: String(newUser._id) })` — games podpina mecze z okna 7 dni, zero ELO (A3). Błąd attach nie kasuje konta (loguj, zwróć complete z ostrzeżeniem opcjonalnie).
  - Limit N konwersji/meczów dziennie per IP/cookie: parametr configu (`GUEST_CONVERT_DAILY_LIMIT`), egzekwuj (MVP: per IP z handshake; RAPORT jeśli brak dostępu do IP — użyj `socket.handshake.address`).
Testy: guestId brany z tokenu (payloadowy `guestId` ignorowany → nie da się przejąć cudzych meczów); konwersja tworzy konto + woła attachGuest z właściwym guestId.

### games-client.ts (A2 właściciel — dodaj metody)
```
playerHistory(userId: string, gameId?: string): Promise<{ ok, data?: PlayerHistory, error?, status }>
guestMatches(guestId: string, sinceMs: number): Promise<{ ok, data?, error?, status }>
attachGuest(args: { guestId: string, userId: string }): Promise<{ ok, data?, error?, status }>
```
POST do `${gamesUrl}/command/player-history | /command/guest-matches | /command/attach-guest` z nagłówkiem internal. Kształty odpowiedzi wg A3.

### RAPORT A2 (dla integratora)
- `policies.ts`: wpisy `messages` i `annotations` (jak wyżej).
- `socket-handlers/index.ts`: `...chatHandlers, ...profileHandlers, ...guestConvertHandlers`.
- Jeśli wydzielasz helper rejestracji z `register.handler.ts` — zgłoś dokładny refactor (integrator scala).
- Config: nowe klucze (`MAX_CHAT_LEN`, `CHAT_RATE_*`, `GUEST_CONVERT_DAILY_LIMIT`) — gdzie w `settings.service.ts`.

---

## OBSZAR A3 — games: annotations + player-history + guest queries (4b/4c)  [skill: back / data]

A3 to JEDYNY agent w `games/app/**`. Edytuje `games/app/models/index.ts` i `games/app/command-api.ts` bezpośrednio.

### Kolekcja annotations (`games/app/models/annotations.schema.ts`, exposed:true)
```
{
  playerId: String (index),
  gameId: String,
  badgeId: String,
  params: Mixed {},
  sentiment: 'positive' | 'neutral' | 'negative',
  earnedAt: Number, createdAt: Number
}
// index { playerId:1, gameId:1 }
```
Rejestr `models/index.ts`: `{ name:'annotations', model: Annotation, exposed:true }`.
> Gate czyta annotations przez raw driver (brak modelu gate) — wystarczy że kolekcja istnieje + polityka gate. NIE dubluj modelu w gate.

### Endpointy `command-api.ts` (internal, nagłówek `x-sixseven-internal`)
- `POST /command/annotate { playerId, gameId, badgeId, sentiment, params? }` → `{ ok:true }`. **MINIMALNY** zapis do `annotations` (bez walidacji z manifestu — Etap 5). Waliduj `sentiment ∈ {positive,neutral,negative}`, rozmiar `params` (≤ np. 1KB). Służy głównie do zasilenia testów widoczności; komentarz „Etap 5: walidacja z puli manifestu".
- `POST /command/player-history { userId, gameId? }` → `{ history: PlayerHistory }`:
  ```
  PlayerHistory = {
    games: [{ gameId, played, wins, losses, draws }],   // agregat
    recent: [{ matchId, gameId, finishedAt, result: 'win'|'loss'|'draw', score }]  // ostatnie N (np. 20)
  }
  ```
  Źródło: `matches` gdzie `players` zawiera userId i `phase='finished'` (+ `endReason!='cancelled_*'`), wynik z `score` (win = unikalny max score = userId; remis = współdzielony max; loss inaczej). `match_events` opcjonalnie do szczegółów. Czysta funkcja stanu (odtwarzalne) — spójne z zasadą E1.
- `POST /command/guest-matches { guestId, sinceMs }` → `{ matches: [{ matchId, gameId, finishedAt }] }`: `matches` gdzie `guestIds` zawiera guestId i `createdAt >= sinceMs`.
- `POST /command/attach-guest { guestId, userId }` → `{ attached: N }`: dla meczów z `guestMatches(guestId, now-7d)`: przenieś guestId z `guestIds` do `players` (pull z guestIds, addToSet do players) — mecz staje się meczem konta. **Zero ELO/ratingu** (ratingu i tak nie ma do 4e; zaznacz komentarzem, że te mecze `ranked=false` i nie generują wpisów). Idempotentne (jeśli już przeniesione, N=0). Okno 7 dni liczone w games (`now - 7*24*3600*1000`).
Testy integracyjne (`games/tests/integration/*`): widoczność adnotacji (przez raw read + symulacja polityki albo unit polityki w gate — tu głównie zapis/odczyt annotations), player-history poprawnie liczy win/loss/draw z score, guest-matches respektuje okno, attach-guest przenosi tylko mecze tego guestId z 7 dni i jest idempotentne, nie przejmuje cudzych (inny guestId).

### RAPORT A3
- Potwierdź brak potrzeby zmian w gate (annotations przez raw read). Wypisz dokładne kształty odpowiedzi (dla A2 client + web).

---

## OBSZAR A4 — web: social (friends + presence) 4a  [skill: front]

NOWE pliki. NIE edytuj: `router/routes/index.ts`, `i18n/locales/{pl,en}/index.ts`, `styles/main.scss`, `modules/layout/{MainMenu,AppMenu,AppVerticalMenu}.vue`, `PreferencesView.vue`, istniejące `*.route.ts` — RAPORTUJ wstawki.

- `web/src/stores/social/{social.model.ts, social.store.ts}`: subskrypcja `friendships` + `presence` przez `useCollection`; komendy `friends:invite/accept/remove`, `presence:set-invisible`; acki; refcount lifecycle jak `rooms.store.ts` (init/cleanup, onReconnect). Gettery: `friends` (accepted, z presence status), `pendingIncoming`, `pendingOutgoing`.
- `web/src/modules/social/`: `FriendsAsidePanel.vue` (slot `aside`: lista znajomych ze wskaźnikiem online/lobby/match live, sekcja zaproszeń przychodzących z Przyjmij/Odrzuć, pole „dodaj po nazwie/ID" → `friends:invite`), `FriendStatusDot.vue` (wskaźnik). Styl: `web/src/styles/modules/social.scss`.
- Invisible pref: `SocialPrivacyToggle.vue` (UiSwitch) wołający `social.store.setInvisible` — RAPORTUJ jedną linię wstawki do `PreferencesView.vue` (integrator wpina), plus klucz i18n.
- i18n ns `social`: `web/src/i18n/locales/pl/social.ts` + `en/social.ts` (klucze: nagłówki, statusy online/lobby/match, akcje invite/accept/remove/odrzuć, pusty stan, błędy). RAPORTUJ 1-liniowe wstawki do `locales/{pl,en}/index.ts`.
- Testy (`__tests__`): store (subskrypcja friendships+presence, acki, invite/accept), komponent Friends panel (mount z i18n pl, render listy/zaproszeń). Wzoruj się na `stores/rooms/__tests__` i `mount-app.ts`.

### RAPORT A4
- Gdzie panel znajomych ma się pojawiać: proponowany `aside` na trasie Home (`home.route.ts`) i/lub globalnie — RAPORTUJ (integrator wpina `aside: FriendsAsidePanel` w wybranych `components`).
- Wpięcia: `routes` (jeśli osobna trasa `/friends`?), `i18n index`, `main.scss` `@use 'modules/social.scss'`, pozycja w menu/profilu (np. dropdown profilu „Znajomi"), linia w `PreferencesView`.

---

## OBSZAR A5 — web: community (chat + profile + guest-convert) 4b/4c  [skill: front]

NOWE pliki. Te same zakazy edycji hotspotów co A4 — RAPORTUJ.

- `web/src/stores/social/{chat.model.ts, chat.store.ts}`: subskrypcja `messages` (filtr klienta `{ scope, scopeId }` — serwer i tak AND-uje members), komenda `chat:send`, acki, rate-limit-error handling. Osobny plik od `social.store.ts` (A4).
- `web/src/modules/social/ChatAsidePanel.vue` (slot `aside` w lobby/`/game/rps`): lista wiadomości (`v-for`, autor+tekst+czas), `UiInput`+`UiButton`/`UiForm` do wysyłki, obsługa limitu długości i rate-limit (komunikat). **Uwaga sekretowa (komentarz w kodzie):** w meczach rankingowych czat renderuje platforma (ten komponent), nie bundle — tu tylko notatka, bundle dopiero 4d.
- `web/src/modules/social/PlayerProfileView.vue` (slot `default`) + `web/src/router/routes/profile-public.route.ts` (trasa `/u/:userId`, adnotacja `const r: RouteRecordRaw = {...}`): woła `profile:get`, renderuje display + historię (win/loss per gra, ostatnie mecze), sekcję odznak z **subskrypcji `annotations`** (useCollection('annotations', { playerId }) — polityka serwera przepuści tylko positive+własne). Komponent `AnnotationsBadges.vue`.
- `web/src/modules/social/GuestConvertView.vue` (ekran po meczu gościa „załóż konto, zachowaj wyniki”): formularz (username/email/hasło) → `guest:convert` przez socket GOŚCIA (token match/guest — reużyj `useTokenSocket`/klienta gościa, NIE `gate.store` usera; po sukcesie zapisz nowy user token jako `hydra_token` i przeloguj na usera). Po sukcesie redirect np. na Home.
- i18n ns `community`: `pl/community.ts` + `en/community.ts` (czat, profil, historia, odznaki, konwersja gościa, błędy). RAPORTUJ wstawki do `locales/{pl,en}/index.ts`.
- Styl: `web/src/styles/modules/community.scss`.
- Testy: chat store (subskrypcja+send+rate-limit ack), ChatAsidePanel (render+wysyłka), PlayerProfileView (mount z zamockowanym profile:get + annotations), guest-convert form (walidacja+wywołanie).

### RAPORT A5
- Gdzie `ChatAsidePanel` w `aside`: trasy lobby/`game-rps.route.ts` (RAPORTUJ, integrator wpina).
- Kiedy pokazać `GuestConvertView`: po `finished` w widoku gry gościa — RAPORTUJ hak (integrator/A5 wskaże miejsce w istniejącym game-app flow; NIE refaktoruj `GameRpsView` — dołóż warunkowy CTA + trasę).
- Wpięcia: `routes/index.ts` (+`profile-public`), `i18n index` (+community), `main.scss` (+community.scss), link do profilu (np. z listy znajomych A4 / lobby → `/u/:userId`), CTA konwersji.

---

## Integracja (robi integrator, nie agenci)
**gate:** `models/index.ts` (+presence,+friendships); `policies.ts` (+presence,+friendships,+messages,+annotations); `socket-handlers/index.ts` (+friends,+chat,+profile,+guest-convert); `app.class.ts`+disconnect (presence lifecycle wg raportu A1); `settings.service.ts` (nowe klucze config); ewentualny helper rejestracji.
**games:** brak (A3 samowystarczalne) — tylko przegląd.
**web:** `router/routes/index.ts` (+profile-public, + ewentualna `/friends`); `i18n/locales/{pl,en}/index.ts` (+social,+community); `styles/main.scss` (+social.scss,+community.scss); menu/profil (Znajomi, link do profilu); `aside` na trasach (Home→Friends, game-rps/lobby→Chat); `PreferencesView.vue` (invisible toggle); CTA + hak konwersji gościa.
**Weryfikacja krzyżowa:** reconcyliacja nazw eventów gate↔web wg tego pliku; spójność kształtów games↔gate-client↔web; testy jednostkowe (Piotr odpala z bazą). Aktualizacja `HANDOFF.md` + `docs/ETAP4_PLAN.md` (oznacz 4a–4c zrobione po weryfikacji).
