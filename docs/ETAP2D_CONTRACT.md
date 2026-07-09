# ETAP 2d — kontrakt integracyjny (źródło prawdy)

> Spina równoległą pracę nad domknięciem Etapu 2 (bramka: **dwóch graczy gra RPS z telefonów przez link**).
> Trzy rozłączne obszary: **gate backend**, **web**, **testy games**. Trzymaj się nazw 1:1 — integrator łączy bez zgadywania.
> Zasady: żaden agent NIE robi operacji git. Testy z bazą odpala Piotr. Wszystko co się da — wstrzykiwalne (fetch/klienci) i testowalne bez sieci.

## Konwencje (istniejące, nie zmieniać)
- Socket: klient emituje `X`, gate odpowiada `X-complete { ... }` albo `X-error { message }`.
- Subskrypcja: `subscribe { tickets: [{ collection, filter }] }`, `unsubscribe { collections: [...] }`; serwer emituje `collection-init|add|update|delete (collection, payload)`.
- Handshake auth: `io(url, { auth: { token } })`.
- Tokeny: `gate/app/services/tokens.service.ts` — `user | guest{guestId,roomId} | handoff{matchId,subjectId} | match{matchId,playerId}` (już zescaffoldowane, użyj `issueGuestToken/issueHandoffCode/issueMatchToken/verifyScopedToken/peekTokenType`).
- Wewnętrzne wywołania gate→games: nagłówek `x-sixseven-internal`, POST `GAMES_URL/command/*`.

---

## A. ROOMS (gate)

Kolekcja `rooms` — `gate/app/models/rooms.schema.ts`, rejestr w `gate/app/models/index.ts`:
```
{
  _id, code,                 // code: 6× [A-Z2-9] (bez 0/1/O/I), unikat + index
  gameId,                    // 'rps'
  name,
  hostId, hostKind,          // 'user' | 'guest'
  visibility,                // 'public' | 'private'
  status,                    // 'open' | 'matched' | 'closed'
  members: [{ id, kind, nick }],   // kind: 'user' | 'guest'
  matchId,                   // null dopóki nie wystartowano
  createdAt, updatedAt,
  expiresAt                  // Date; TTL index 24h (expireAfterSeconds: 0)
}
```

Polityka subskrypcji `rooms` (`gate/app/subscriptions/policies.ts`) — publiczne otwarte LUB własne:
```
rooms: { filter: (subject) => ({ $or: [
  { visibility: 'public', status: { $ne: 'closed' } },
  { 'members.id': subject._id },
] }) }
```

Komendy socket (auth: `socket.user`):
- `rooms:create { gameId, name, visibility }` → `rooms:create-complete { roomId, code }` | `rooms:create-error { message }`. Host = `socket.user`, dodany jako member `{ id: user._id, kind:'user', nick: user.username }`. `code` generowany unikalnie (retry przy kolizji).
- `rooms:join { code }` → `rooms:join-complete { roomId }` | `rooms:join-error { message }`. Dodaje `socket.user` do members (idempotentnie). Odrzuć gdy brak pokoju / `status !== 'open'`.
- `rooms:leave { roomId }` → usuwa membera; jeśli wychodzi host → `status='closed'`. Ack `rooms:leave-complete { roomId }`.
- `rooms:start { roomId }` → `rooms:start-complete { roomId, matchId }` | `rooms:start-error { message }`. TYLKO host, members ≥ 2. Woła games `create-match` (players = id członków-`user`, guestIds = id członków-`guest`, options np. `{ target: 2 }`). Ustaw `matchId`, `status='matched'`.

Guest join (REST — gość nie ma jeszcze socketu):
- `POST /rooms/join-guest { code, nick }` → `200 { token, roomId, guestId, gameId }` | `4xx { message }`. Wymaga `status==='open'`. `guestId = 'g_' + rand`. Dodaje member `{ id: guestId, kind:'guest', nick }`. `token = issueGuestToken(secret, { guestId, roomId })`.

---

## B. HANDOFF → TOKEN MECZU (gate)

- Socket `games:request-handoff { matchId }` → `games:handoff-complete { code, gameId, playerId }` | `games:handoff-error { message }`. Auth: `socket.user` LUB `socket.guest`. `subjectId = user._id ?? guest.guestId`. Gate weryfikuje członkostwo przez games `get-match` (sekcja D): `subjectId ∈ players ∪ guestIds`. `code = issueHandoffCode(secret, { matchId, subjectId })`.
- REST `POST /auth/match-token { code }` → `200 { token, matchId, playerId, gameId, expiresAt }` | `4xx { message }`. Weryfikuje handoff (`verifyScopedToken` typ `handoff`). `token = issueMatchToken(secret, { matchId, playerId: subjectId })`. `gameId` z games `get-match`. `expiresAt = Date.now() + 6h`.

---

## C. Socket autoryzowany tokenem meczu / gościa (gate)

`AuthenticatedSocket` (`gate/app/socket-handlers/index.ts`) rozszerz o:
```
match?: { matchId: string; playerId: string } | null
```
Middleware (`gate/app/app.class.ts`): `peekTokenType(token) === 'match'` → `verifyScopedToken` → `authSocket.match = { matchId, playerId }`. (guest już obsłużony; user domyślny.)

Komendy games — rozszerz `gate/app/socket-handlers/games/games.handler.ts`:
- `games:submit-move { matchId, move }`: jeśli `socket.match` → `playerId = socket.match.playerId` i **wymagaj** `matchId === socket.match.matchId` (inaczej `-error`). Jeśli `socket.user` → jak dziś (`playerId = user._id`). (guest z sesji pokoju gra przez token meczu, więc submit idzie socketem match — `socket.guest` nie składa ruchów.)
- `games:reveal-done { matchId }`: analogicznie scope do `socket.match.matchId`.
- `games:create-match` / `games:start` / `games:request-handoff` — NIE dla socketu `match`.

Subskrypcja — rozszerz `gate/app/socket-handlers/general/subscribe.handler.ts`, aby obsłużyć socket bez `user`:
- `socket.match`: dozwolone WYŁĄCZNIE `matches` z twardym filtrem `{ _id: matchId }` oraz `match_views` z `{ playerId, matchId }` (AND z filtrem klienta). Klucz subskrypcji = `playerId`.
- `socket.guest`: dozwolone `rooms` z `{ 'members.id': guestId }`; (mecz gość gra tokenem match, więc match_views/matches idą tam). Klucz = `guestId`.
- `socket.user`: bez zmian (obecna logika policies).
Zachowaj default-deny (kolekcja spoza dozwolonych → odrzuć).

---

## D. games — weryfikacja członkostwa (games)

`games/app/command-api.ts` — nowa komenda internal (auth `x-sixseven-internal`):
- `POST /command/get-match { matchId }` → `200 { matchId, gameId, players: [], guestIds: [], phase }` | `404`.
Gate `gate/app/services/games-client.ts` — metoda `getMatch(matchId): Promise<{ ok, data?, error?, status }>`.

(To jedyne pliki w `games/app/**` ruszane przez agenta gate. Agent testów games NIE dotyka `command-api.ts`.)

---

## E. Wielotokenowe sesje (gate)

`gate/app/models/users.schema.ts`: dodaj `sessions: [{ token: String, createdAt: Number, userAgent: String }]`. Model minimalny: `users.token` → `users.sessions[]`.
- Login (`general/login.handler.ts`): DOPISZ nową sesję (nie nadpisuj istniejących), zwróć token tej sesji. Kontrakt web bez zmian (`login-complete` niesie `userData.token`).
- Middleware (`app.class.ts`): weryfikacja user przez `UserModel.findOne({ _id: decoded._id, 'sessions.token': token })` (zamiast `token`).
- Logout (`general/logout.handler.ts`): usuń TYLKO bieżącą sesję (po tokenie), nie wszystkie urządzenia. `logout-complete { _id }` bez zmian.
- Seed/admin/sync — zadbaj o kompatybilność (users bez `sessions` nie wybuchają).
- Zaktualizuj `sensitiveFields`/politykę `users`, by nie wyciekać `sessions[].token` (sanitize `sessions` albo `sessions.token`).

---

## F. WEB (web/src) — nowe pliki, kontrakt jak wyżej

NIE edytuj plików współdzielonych: `router/routes/index.ts`, `styles/main.scss`, `config/font-awesome.config.ts`, `modules/layout/MainMenu.vue`. Zamiast tego **wypisz w raporcie** dokładnie co dołożyć (trasy, ikony, importy scss, pozycja menu) — integrator wpina.

- `stores/rooms/{rooms.model.ts, rooms.store.ts}`: subskrypcja `rooms` (użyj `composables/useCollection`), komendy `rooms:*`, acki. Wzoruj się na `stores/games/games.store.ts`.
- `modules/rooms/`: `RoomsView` (hub: publiczne otwarte + moje + „Nowy pokój"), `RoomDetail` (link `/r/CODE`, lista członków, „Start" dla hosta, po `matched` przycisk „Graj"), `CreateRoomForm`. Własny plik `router/routes/rooms.route.ts` (trasa `/rooms`, `/rooms/:id`).
- Wejście z linku: `router/routes/room-join.route.ts` (trasa `/r/:code`, publiczna — dodaj `meta.public`? uwaga: guard). `RoomJoinView`: zalogowany → `rooms:join` → `/rooms/:id`; niezalogowany → formularz nicku → `POST /rooms/join-guest` → zapis guest tokenu (osobny klucz, NIE `hydra_token`) → widok pokoju gościa (subskrypcja `rooms` guest tokenem).
- „Graj": po `rooms:start`/gdy `room.matchId` → `games:request-handoff { matchId }` → na `games:handoff-complete` redirect do `/game/rps?handoff=CODE&return=/rooms/:id` (dev: ta sama apka, inna trasa).
- Aplikacja gry: `modules/game-app/GameRpsView.vue` + własny plik `router/routes/game-rps.route.ts` (trasa `/game/rps`, publiczna). NIE używa `gate.store` usera. Osobny cienki klient (własna instancja `socket.io-client` z auth `{ token: matchToken }`) po wymianie `POST /auth/match-token { code }`. Stan meczu z subskrypcji `matches`/`match_views` (tym socketem). Reużyj prezentacji z `modules/games/`: `RpsHand.vue`, `rps.consts.ts`, klasy `.rps-*` (styl już w `styles/modules/games.scss`). NIE refaktoruj istniejącego `RpsBoard.vue` (2c ma działać). Po `finished` — ekran wyniku + powrót do `return`.
- Env: bazowy URL REST gate do `POST /auth/match-token` i `/rooms/join-guest` — dodaj `VITE_GATE_HTTP_URL` (np. `https://localhost:4114`) obok `VITE_GATE_URL`.

---

## Integracja (robi integrator, nie agenci)
- Wpięcie tras web w `router/routes/index.ts`, ikony FA, importy scss, pozycja menu „Pokoje".
- Reconcyliacja nazw eventów gate↔web wg tego pliku.
- Aktualizacja `ETAP2.md` / `docs/ETAP2_PLAN.md`.
