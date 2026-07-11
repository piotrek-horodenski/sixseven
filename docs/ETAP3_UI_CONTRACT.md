# Etap 3 (wejście) — kontrakt UI + „obaj gracze startują"

> Źródło prawdy dla sesji przebudowy UX (2026-07-11). Trzy rozłączne obszary
> pracowane równolegle agentami, spięte tym plikiem. Wzorzec jak `ETAP2D_CONTRACT.md`:
> rozłączne pliki, precyzyjny kontrakt z góry, potem integracja i weryfikacja krzyżowa.

## Decyzje (od Piotra)

1. **Home = kafelki otwartych pokoi/gier założonych przez graczy** + „Nowa gra".
   Scala dotychczasowe `/rooms` (lista) i `/play` (lista meczów) w jeden widok pod `/`.
   Klik w kafelek = wejście do pokoju (`/rooms/:id`).
2. **Menu górne = tylko Home.** Profil/wyloguj oraz (dla uprawnionych) Admin i Images
   przeniesione do menu profilu „w rogu" (dropdown), nie do głównej nawigacji.
3. **Wywalić widoki `controls` i `typography`** (trasy + moduły + pozycje w menu).
4. **Widok pokoju uproszczony:** informacje o graczach + przyciski **Graj** i **Opuść**.
5. **Gra rusza dopiero, gdy OBAJ gracze ją rozpoczną.** Dziś każdy pojedynczy klik
   „Rozpocznij" w aplikacji gry robił Lobby→Planning i odpalał timer u obu graczy
   (`engine.start` przechodzi przy pierwszym wywołaniu). Do naprawy: brama gotowości
   w lobby aplikacji gry.

## Podział pracy (rozłączne pliki — NIE wchodzić w cudze)

### Obszar A — „lobby-ready gate" (punkt 5). Backend + aplikacja gry.
Pliki (własność wyłączna):
- `games/app/models/matches.schema.ts`
- `games/app/engine/engine.ts`
- `games/app/command-api.ts`
- `games/tests/command-api.test.ts` (+ ewentualne testy silnika)
- `gate/app/services/games-client.ts`
- `gate/app/socket-handlers/games/games.handler.ts`
- `gate/tests/handlers/games.test.ts`, `gate/tests/services/games-client.test.ts`
- `web/src/stores/games/games.model.ts`
- `web/src/composables/useMatchClient.ts`
- `web/src/composables/__tests__/useMatchClient.test.ts`
- `web/src/modules/game-app/GameRpsView.vue`
NIE dotykać: routingu, layoutu, home, rooms, RoomDetail, legacy komponentów `modules/games/*`.

### Obszar B — nawigacja, menu, Home (punkty 2 + 3). Web.
Pliki (własność wyłączna):
- `web/src/router/routes/index.ts`
- `web/src/router/routes/{controls,typo,typo2,games}.route.ts` (usunięcie)
- `web/src/router/routes/rooms.route.ts`, `web/src/router/routes/home.route.ts`
- `web/src/modules/layout/{MainMenu,AppMenu,AppVerticalMenu,AppLayout}.vue`
- `web/src/modules/home/*` (HomeView staje się hubem kafelków)
- `web/src/modules/rooms/{RoomsView,RoomsIntro,CreateRoomForm}.vue`
- `web/src/modules/controls/*` (usunięcie), `web/src/modules/typography/*` (usunięcie)
Czyta (nie edytuje): `web/src/stores/rooms/rooms.store.ts` (gettery `publicOpenRooms`,
`myRooms`, komenda `createRoom`). NIE dotykać `RoomDetail.vue` ani `rooms.store.ts`.

### Obszar C — uproszczenie pokoju (punkt 4). Web.
Pliki (własność wyłączna):
- `web/src/modules/rooms/RoomDetail.vue`
- `web/src/stores/rooms/rooms.store.ts` (tylko jeśli konieczne; API addytywnie)
- `web/src/stores/rooms/__tests__/rooms.store.test.ts`
NIE dotykać: routingu (`rooms.route.ts` należy do B), `RoomsView`, `CreateRoomForm`, Home.
API `rooms.store` MUSI zostać stabilne (B na nim polega): nie zmieniać sygnatur
`publicOpenRooms`, `myRooms`, `roomById`, `isHost`, `isMember`, `createRoom`, `join`,
`leave`, `start`, `requestHandoff` — wolno tylko dodawać.

## API punktu 5 (lobby-ready gate) — kontrakt gate ↔ games ↔ web

**Cel:** Planning (i timer) startuje dopiero, gdy KAŻDY uczestnik rosteru
(`players ∪ guestIds`) zgłosił gotowość w fazie `lobby`.

**Model `matches`** (`matches.schema.ts`): nowe pole
`lobbyReady: { type: Schema.Types.Mixed, default: {} }` — mapa `playerId -> bool`.
Pole jawne (jak `ready`), bez treści ruchów. Row-level oddaje je razem z dokumentem.

**Silnik (`engine.ts`):**
- `createMatch` ustawia `lobbyReady: {}`.
- Nowa metoda `playerReady(matchId, playerId): Promise<void>`:
  - `if (!match || match.phase !== 'lobby') return` (idempotentne poza lobby).
  - roster = `players ∪ guestIds`; `if (!roster.includes(playerId)) return`.
  - `Match.updateOne({ _id, phase:'lobby' }, { $set: { 'lobbyReady.<pid>': true, updatedAt } })`.
  - policz gotowych z rosteru; gdy **wszyscy** → `await this.start(matchId)`.
- `start(matchId)` zostaje BEZ zmian (wewnętrzny wyzwalacz po komplecie gotowości;
  idempotentny — wyścig dwóch „ready" naraz jest bezpieczny).
- `state-machine.ts` bez zmian.

**Command API (`command-api.ts`):**
- `EngineCommands`: metodę `start(matchId)` zastąpić `playerReady(matchId, playerId)`.
- `POST /command/start` przyjmuje `{ matchId, playerId }` (oba wymagane, 400 gdy brak),
  woła `deps.engine.playerReady(matchId, playerId)`, zwraca `{ ok: true }`.

**Gate klient (`games-client.ts`):** `start(matchId, playerId)` → `POST /command/start
{ matchId, playerId }` z `x-sixseven-internal`.

**Gate handler (`games.handler.ts`):** `games:start` wylicza `playerId` z tożsamości
tokenu (`matchScope.playerId ?? String(user._id)`) — NIGDY z payloadu — i woła
`client.start(matchId, playerId)`. Zachować walidację scope tokenu meczu.

**Web model (`games.model.ts`):** `Match` dostaje `lobbyReady?: Record<string, boolean>`.

**Web klient (`useMatchClient.ts`):** `startMatch()` bez zmian sygnatury (emituje
`games:start { matchId }`; gate dokłada playerId). Zaktualizować komentarz „dowolny gracz
rozpoczyna" — teraz „gracz zgłasza gotowość; Planning po komplecie".

**Web UI (`GameRpsView.vue`):** ekran `lobby`:
- `iAmLobbyReady = !!match.lobbyReady?.[meId]`, `oppLobbyReady = !!match.lobbyReady?.[oppId]`.
- „Rozpocznij" wywołuje `startMatch()`; po kliknięciu, gdy `iAmLobbyReady` →
  przycisk znika/blokuje się, pokaż „Czekam aż {przeciwnik} rozpocznie…" + wskaźnik
  gotowości przeciwnika. Gdy obaj gotowi, backend przełącza w `planning` (istniejący
  watcher `phase` odpala UI planowania).
- `returnUrl` fallback zmienić z `/rooms` na `/` (lista `/rooms` znika; `?return=`
  z RoomDetail dalej celuje w `/rooms/:id`, które zostaje).

## Standardy (jak w Etapie 2)
- Zależności wstrzykiwane, testy bez sieci/bazy gdzie się da; `playerId` zawsze z
  tożsamości tokenu (bezpieczeństwo). Sandbox NIE odpala testów/Dockera — pisze kod +
  testy, odpala Piotr. Weryfikacja: `Read` + `tsc --noEmit` na izolowanych plikach.
- Git: commituje wyłącznie Piotr.
- Przed usunięciem pliku: `grep` importerów; build ma zostać zielony.
