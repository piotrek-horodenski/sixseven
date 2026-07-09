# gate — brama czasu rzeczywistego i tożsamości

## Rola

Jedyne wejście klientów (web platformy i aplikacji gier) do sixseven. Uwierzytelnia, autoryzuje i dostarcza stan w czasie rzeczywistym: klient subskrybuje kolekcje Mongo, gate pilnuje polityk dostępu i pcha zmiany przez socket.io (change streams). W modelu sekretu gate jest **strażnikiem drzwi**: to jego polityki decydują, że nikt nie zobaczy dokumentu, którego widzieć nie ma prawa.

## Odpowiedzialności

- **Tożsamość i tokeny:** konta (JWT z rewokacją w DB — wzorzec hydry), RBAC z dziedziczeniem ról, sesje gości, kody handoff → tokeny meczu (scoped), tokeny deweloperskie. Tabela tokenów: `IMPLEMENTATION_PLAN.md`.
- **Subskrypcje z politykami row-level:** rejestr deklaratywnych polityk per kolekcja `{ requiredPermission?, injectFilter?(user), sanitize?(doc, user) }`; filtr klienta AND-owany z serwerowym; sanityzacja pól (np. `games` bez URL-i i sekretów). Protokół: `subscribe {tickets} → collection-init/add/update/delete`.
- **Proxy komend:** `games:*` (submit-move, reveal-done, join-room...) przekazywane HTTP do serwisu games z kontekstem tożsamości; synchroniczny ack/błąd.
- **Presence:** cykl życia socketów → kolekcja `presence` (online/lobby/match, lastSeen).
- **Czat:** wiadomości lobby/meczu (kolekcja `messages`, polityka członkostwa, rate limit).
- **Rate limiting** per typ tokenu i zdarzenie (wzorzec z hydry, rozszerzony o sesje gości i tokeny meczu).

## Czego nie robi

Nie zna reguł żadnej gry, nie trzyma stanu meczów, nie liczy ELO ani zaufania, nie woła serwisów gier (to games), nie wykonuje audytów (to judge). Nie przechowuje treści ruchów — komenda `submit-move` przepływa do games bez logowania payloadu.

## Interfejsy

Wejście: WSS (socket.io — protokół `collection-*` + `domain:action`), REST pomocnicze (health, wymiana handoff). Wyjście: Mongo (odczyt/watch bazy platformy, zapis users/presence/messages), HTTP → games (komendy z tożsamością).

## Fundament z hydry i specyfika

Reużywamy: silnik change streams (`subscriptions.ts` — najcenniejszy kawałek hydry), auth JWT z handshake, RBAC (`sync-users.service`), framework handlerów z rate-limitem. Ryzyka i znane problemy: **autoryzacja subskrypcji jest dziś tylko na poziomie kolekcji** (luka #1 całego projektu), dedupe ticketów gubi multi-device (bug do potwierdzenia), dopasowywanie filtrów jest in-process (skalowanie na wiele instancji wymaga `@socket.io/mongo-adapter` i przemyślenia fan-outu — po MVP), `JWT_SECRET` hardcoded w compose (rotacja w etapie 0).

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Wycinka domeny studia (engines/clusters/projects/concepts: schematy, handlery, seedy), rotacja sekretów, reseed ról pod gry | 0 |
| 2 | Naprawa multi-device dedupe (test + poprawka per socket) | 0 |
| 3 | **Rejestr polityk row-level** + sanityzacja per polityka; migracja `subscribe.handler`; polityki dla wszystkich kolekcji z tabeli w planie głównym | 1 |
| 4 | Sesje gości (TTL 24 h, limity per cookie/IP), kody handoff, tokeny meczu, moduł HMAC (współdzielony z games) | 1 |
| 5 | Proxy komend `games:*` → games (kontrakt wewnętrzny, propagacja tożsamości i typu tokenu) | 2 |
| 6 | Presence (heartbeat, statusy, TTL) | 3 |
| 7 | Czat lobby/meczu + rate limity konwersacyjne | 4 |
| 8 | Hardening: audyt polityk (test S1 „szpieg API" w CI), limity dla tokenów meczu | 1→ciągle |

**Kryterium „zrobione" dla rdzenia:** test S1 przechodzi — konto z ważnym JWT i dowolnymi filtrami nie jest w stanie zobaczyć cudzego `match_views`, treści ruchu ani pól sanityzowanych.

## Niewiedza lokalna

Skalowanie multi-instancji (po MVP), kalibracja limitów gości, czy wymiana handoff idzie przez REST czy WS (drobiazg — rozstrzygnąć w etapie 1 przy implementacji).
