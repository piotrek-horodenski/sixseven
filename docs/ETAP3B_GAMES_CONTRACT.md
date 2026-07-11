# Etap 3B — „nie ma pokojów, są gry": przepływ + preferencje

> Sesja 2026-07-11 (druga część). Decyzje Piotra + kontrakt między falami.
> Wykonywane falami (zależności), agenci na rozłącznych plikach.

## Decyzje (od Piotra)

- **Nie ma pokojów — są gry.** Mecz powstaje OD RAZU przy zakładaniu gry. Twórca
  ląduje na ekranie gry i czeka na przeciwnika (bez limitu czasu; bot w przyszłości).
  Inny gracz klika kafelek → od razu ekran gry; twórca widzi „dołączył gracz" i może
  kliknąć „Rozpocznij".
- **Home** = kwadratowe kafelki w gridzie 1/3/9 (mobile 1, więcej na dużych ekranach).
  Pierwszy kafelek = „Nowa gra" → ekran konfiguracji (jaka gra, ilu graczy; teraz RPS/2).
  Kolejne kafelki = otwarte gry innych graczy → klik = wejście na ekran gry.
- **Auto-start:** po pierwszym „Rozpocznij" pozostali mają `planningPhaseMs` (tyle co
  tura) na kliknięcie; jak nie klikną, gra rusza automatycznie.
- **RPS:** preferencja gracza = **ruch awaryjny (fallback)** składany, gdy upłynie czas
  tury. Wartości: `rock|paper|scissors|random`. Default dostarczony przez dewelopera = `random`.
- **Menu profilu → Preferencje:** (1) ustawienia aplikacji: light/dark, język pl/en;
  (2) ustawienia per gra (na start RPS fallback). Pierwszy raz = default dewelopera.
- **i18n: cała aplikacja** (pl/en).

## Model przepływu (dyskusja discovery vs sekret)

`rooms` ZOSTAJE jako publiczna warstwa DISCOVERY („otwarte gry" na Home — lista publiczna
działa row-level). `matches` to sekret (token meczu, S3). Każda otwarta gra = jeden `room`
(publiczny, open) z DOWIĄZANYM `matchId` utworzonym od razu.

Terminologia „pokój→gra" jest w UI (fala 2). Backend zachowuje kolekcję `rooms` jako rejestr
otwartych gier — mniej ryzyka, reużycie polityk i subskrypcji.

## Fale i własność plików

- **Fala 1A (backend):** `games/**` (engine, command-api, scheduler, settings, models),
  `gate/app/socket-handlers/{rooms,games}/*`, `gate/app/services/games-client.ts`,
  `gate/app/api/*` (endpointy prefs). Testy backendu.
- **Fala 1B (catalog/rps):** `catalog/rps/**` wyłącznie.
- **Fala 2A (web flow):** routy, `modules/home/*`, moduł gier (kafelki, ekran tworzenia,
  ekran gry `game-app/*`), rename pokój→gra w UI. Zależy od 1A.
- **Fala 2B (web prefs):** moduł preferencji w menu profilu, motyw, język (store), wpięcie
  do menu profilu i RPS-prefs UI. Zależy od 1A (endpointy prefs).
- **Fala 3 (i18n):** cały web, po ustabilizowaniu 2A/2B.

Faz 2A i 2B pilnować rozłączności plików (menu profilu, game-app) — dograć w kontrakcie fazy 2.

---

## KONTRAKT FALI 1A (backend) — do zaimplementowania

### 1. Mecz tworzony przy zakładaniu gry + otwarty slot

- `matches.schema.ts`: dodać `capacity: { type: Number, default: 2 }` (docelowa liczba
  graczy). Mecz jest „otwarty", gdy `players.length + guestIds.length < capacity`.
- **Zakładanie gry** (`gate rooms:create` → rozszerzyć): po utworzeniu roomu utworzyć od
  razu mecz przez `games-client.createMatch` z `players=[creator]` (lub `guestIds` dla
  gościa), `capacity` (z configu; RPS=2), `options{ target, ... }`. Zapisać `matchId` w
  roomie (`setMatched`/nowa metoda) — ale room ZOSTAJE `status:'open'` (wciąż dołączalny),
  dopóki slot wolny. Ack `rooms:create-complete` zwraca `{ roomId, code, matchId }`.
- Twórca dostaje handoff od razu (jest w `players`) → wchodzi na ekran gry i czeka.

### 2. Dołączenie dodaje gracza do meczu + re-init

- **Dołączenie** (`gate rooms:join` → rozszerzyć): po dodaniu membera do roomu, jeśli room
  ma `matchId` i mecz ma wolny slot → dołóż gracza do meczu: nowa komenda
  `games-client.joinMatch(matchId, playerId, kind)` → games `POST /command/join-match`
  → `engine.addPlayer(matchId, playerId, kind)`:
  - guard: mecz istnieje, faza `lobby`, gracz jeszcze nie w składzie, jest wolny slot;
  - dopisz do `players` (user) lub `guestIds` (guest);
  - **re-init**: ponownie zawołaj `/init` z pełnym rosterem (jak create-match: pobierz
    prefs graczy, zbuduj `playerData`), nadpisz `match_states` rundy 1 (`sealed:false`)
    nowym stanem, zachowaj `phase:'lobby'`. (Mecz w lobby, bez ruchów — re-init bezpieczny.)
  - gdy slot się zapełnił → room `setMatched` (już nie na liście otwartych).
- Dołączający dostaje handoff → ekran gry (lobby). Subskrypcja `matches` twórcy pokaże
  nowego gracza w `players` (S3-bezpiecznie — to nie treść ruchu).

### 3. Auto-start po planningPhaseMs (i brak auto-cancel lobby)

- `engine.createMatch`: `deadline = null` (czekanie na przeciwnika bez limitu — NIE
  `lobbyTimeoutMs`). Lobby NIE jest już auto-anulowane po czasie.
- `engine.playerReady` (istnieje z pkt 5): przy PIERWSZYM zgłoszeniu gotowości w lobby
  ustaw `deadline = now + planningPhaseMs(match)` (to samo źródło co faza planowania).
  Gdy wszyscy gotowi wcześniej → `start()` jak dziś (i tak wyzeruje/nadpisze deadline).
- `scheduler.ts`: gałąź `case 'lobby'` — ZAMIAST `cancel(...,'cancelled_lobby')` zrobić:
  jeśli mecz ma choć jedno `lobbyReady=true` → `engine.start(id)` (auto-start); w innym
  wypadku (brak gotowych, a deadline minął — nie powinno wystąpić, bo deadline stawiamy
  dopiero przy 1. ready) → nic. Uwaga: nie stawiamy deadline w lobby przed 1. ready, więc
  scheduler nie „złapie" świeżo założonej gry.
- Zaktualizować `state-machine` NIE trzeba (start bez zmian). Uwaga na cancel z lobby przy
  wyjściu twórcy (leave) — patrz niżej.

### 4. Prefs do /init (paliwo dla RPS fallback — kontrakt z 1B)

- `command-api.ts` `create-match` ORAZ ścieżka re-init (`join-match`): zamiast
  `playerData: {}` zbudować `playerData: Record<playerId, { data, prefs }>` z kolekcji
  `player_memory` (dla każdego gracza rosteru: `{ data, prefs }`, brak wpisu = `{}`/`{}`).
  Przekazać do `/init`. (RPS w 1B czyta `playerData[pid].prefs.fallbackMove`.)
- Dodać wstrzykiwalny `loadPlayerMemory(gameId, playerIds) => Record<pid,{data,prefs}>`
  w deps command-api (domyślnie z `PlayerMemory`), by testy szły bez bazy.

### 5. Odczyt/zapis prefs per (user, gra) POZA meczem (dla ekranu preferencji, fala 2B)

- games command: `POST /command/get-prefs { gameId, playerId }` → `{ prefs }` z
  `player_memory` (puste `{}` gdy brak). `POST /command/set-prefs { gameId, playerId, prefs }`
  → upsert `player_memory.prefs` (limit rozmiaru ~4KB, walidacja że to obiekt).
- gate: socket-handlery `games:get-prefs` / `games:set-prefs` (albo REST) — `playerId`
  ZAWSZE z `socket.user._id` (nigdy z payloadu). Ack `games:get-prefs-complete { gameId, prefs }`
  / `games:set-prefs-complete`. (Gość prefs nie zapisuje — wymagany user.)
- games-client: `getPrefs(gameId, playerId)`, `setPrefs(gameId, playerId, prefs)`.

### Leave/cancel (spójność z „grą zamiast pokoju")
- Zachowaj `rooms:leave`. Gdy twórca wyjdzie z gry przed startem: zamknij room (jak dziś)
  ORAZ anuluj powiązany mecz jeśli wciąż `lobby` (`engine.cancel(matchId,'cancelled_lobby')`).
  Gdy dołączający wyjdzie w lobby: usuń go z meczu (wróć slot) — opcjonalnie; MVP: może
  zostać, re-init nie jest wymagany do MVP. Zdecyduj najprościej, opisz w raporcie.

### Standardy
Zależności wstrzykiwane; testy bez sieci/bazy; `playerId` z tożsamości tokenu/JWT;
sandbox nie odpala testów/Dockera (odpala Piotr); git tylko Piotr; przed usunięciem pliku grep.

---

## KONTRAKT FALI 1B (catalog/rps) — do zaimplementowania

- **Manifest**: zadeklaruj preferencje gracza (schemat), pole `fallbackMove` enum
  `rock|paper|scissors|random`, default `random`. (Kształt schematu prefs — najprościej,
  ale spójnie z tym, co odczyta ekran preferencji: `manifest.playerPrefs` lista pól
  `{ key, type:'enum', values, default, label? }`. Uzgodnij w raporcie, fala 2B to skonsumuje.)
- **init(`{ playerIds, seed, playerData, options }`)**: zapisz do stanu:
  - `seed` (do deterministycznego „random"),
  - `fallback: Record<pid, 'rock'|'paper'|'scissors'|'random'>` z
    `playerData[pid]?.prefs?.fallbackMove`, default `'random'`.
  Zachowaj istniejące `round/target/scores`.
- **defaultMove(state, playerId)**: zwróć `state.fallback[playerId]`; dla `'random'`
  policz DETERMINISTYCZNIE z `state.seed + playerId + state.round` (np. hash → mod 3).
  Nadal deterministyczne (wymóg replay-auditu/harness).
- **resolve**: bez zmian logiki wyniku; pamiętaj przenieść `seed` i `fallback` do stanu
  następnej rundy (żeby fallback działał w każdej rundzie).
- Testy: kontrakt/determinizm (harness), plus: gracz z prefs `paper` spóźniony → złożony
  `paper` (`defaulted:true`); `random` deterministyczny po round-tripie JSON.
- SDK: `defaultMove(state, playerId)` już ma sygnaturę pod to — **nie ruszać packages/sdk**.
