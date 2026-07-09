# Etap 1 — status wykonania

> "Sekret ma dom": row-level polityki subskrypcji, typy tokenów, podpisy HMAC. Bazuje na etapie 0 (`ETAP0.md`).

## Zrobione

**Rejestr polityk subskrypcji** (`gate/app/subscriptions/policies.ts`) — deklaratywny, per kolekcja. Zastępuje dawne gating tylko-per-kolekcja. Trzy mechanizmy:

- **Default-deny.** Kolekcja bez wpisu w rejestrze jest nieskubskrybowalna. To automatycznie i trwale chroni prywatne kolekcje games (`moves`, `match_states`, `resolve_log`, `player_memory`, `registrations`) — nie trzeba ich nigdzie „zakazywać", po prostu nigdy nie są zarejestrowane. To domyka „lukę #1" z audytu (subskrypcja dowolnej niechronionej kolekcji).
- **Row-level filter injection.** Polityka może wstrzyknąć filtr serwera łączony z filtrem klienta przez `$and` (`mergeFilters`). Klient może zawęzić, nigdy poszerzyć. Wzorce zgodne z modelem danych z planu: `match_views` → `playerId == user`, `queue` → `userId == user`.
- **Sanityzacja pól** per polityka (`users` → zdejmuje `password`/`token`). `subscriptions.ts` bierze listę pól z rejestru (jedno źródło prawdy).

Wpięte w `subscribe.handler.ts` (deny + wstrzyknięcie filtra przed przekazaniem do subManagera).

**Typy tokenów** (`gate/app/services/tokens.service.ts`) — `user`/`guest`/`handoff`/`match`. Funkcje przyjmują sekret jawnie (czyste, testowalne bez ładowania `settings.service`). Middleware auth (`app.class.ts`) rozgałęzia: token `guest` → `socket.guest = { guestId, roomId }`; reszta → dotychczasowa ścieżka użytkownika z rewokacją w DB. `AuthenticatedSocket` rozszerzony o `guest`.

**Moduł HMAC** (`packages/hmac`) — wspólny pakiet `sixseven-hmac`: `sign`/`verify` (HMAC-SHA256 nad `${timestamp}.${body}`), okno ±30 s, porównanie w stałym czasie, ochrona przed replayem. Używany przez silnik meczu (etap 2) i weryfikowany po stronie SDK twórcy.

**Testy dodane:** `policies.test.ts` (default-deny, row-level, `mergeFilters`, sanitize), `s1-spy.test.ts` (S1 — konto-szpieg), `tokens.test.ts`, `packages/hmac/tests/hmac.test.ts`.

## Zescaffoldowane (pełne wiązanie w etapie 2)

- **Kody handoff i tokeny meczu** — funkcje wystawiania/weryfikacji gotowe, ale jednorazowość handoffu i wiązanie tokenu meczu z konkretnym meczem wymaga kolekcji `registrations`/`matches`, które tworzy games w etapie 2.
- **Polityki `match_views`/`queue`/`ratings`** — zdefiniowane, lecz kolekcje powstają w etapie 2+. Subskrypcja nieistniejącej kolekcji zwraca zero dokumentów; row-level zadziała od chwili, gdy games zacznie je zapisywać.
- **`useCollection` w web** — nieujęte; web nadal subskrybuje wzorcem per-store. Do zrobienia razem z ekranami meczu (etap 2).

## Do zweryfikowania (RUNTIME, u Ciebie)

**Krytyczne:** matcher strumienia zmian używa biblioteki `query` (github:protobi/query) w `subscriptions.ts::matches()`. Row-level opiera się na filtrze `{ $and: [polityka, klient] }`. **Potwierdź, że protobi/query obsługuje `$and`** — jeśli nie, matching change-streamów dla kolekcji row-level trzeba zaimplementować ręcznie (mongoose `find` dla danych początkowych `$and` obsługuje). Test S1 działa na poziomie `subscribe.handler` (nie uruchamia matchera), więc tego nie złapie — wymaga testu integracyjnego z realnym strumieniem lub sprawdzenia API biblioteki.

Reszta jak w `ETAP0.md`: uruchom `npm install` + `npm run test:gate` (mockuje Mongo). Nowe testy: `tests/subscriptions/policies.test.ts`, `tests/subscriptions/s1-spy.test.ts`, `tests/services/tokens.test.ts`. HMAC: `npm test --workspace packages/hmac`.

## Decyzja wciąż otwarta (z etapu 0)

Model sesji jednotokenowy (`user.token`) vs wielotokenowy. Sesje gościa są niezależne (własny typ tokenu, bez wpisu w `user.token`), więc guest multi-tab działa. Ale wielo-urządzeniowość zalogowanego konta nadal wymaga decyzji o liście sesji per user.

## Następny krok — etap 2 (największy)

Silnik meczu + pierwszy sekret end-to-end (RPS): maszyna stanów (Paused/Cancelled), kolekcje prywatne games, `resolve_log`, wire contract + `sixseven-sdk serve` + harness `test`, RPS jako zdalny serwis + aplikacja UI (handoff → token meczu), pokój przez link. Tu HMAC i typy tokenów wchodzą do realnego użycia; testy S2/S3 + inwarianty I1–I5.
