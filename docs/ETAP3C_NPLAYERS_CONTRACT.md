# Etap 3C — RPS dla N graczy + porządki na Home

> Sesja 2026-07-11 (cz. 3). Decyzje Piotra + kontrakt między falami.

## Decyzje
- **RPS dla N graczy (2..N, bez twardego max).** Punktacja rundy = suma parowa:
  dla każdej pary (i,j): wygrany +1, przegrany −1, remis 0; punkt rundy gracza =
  suma po wszystkich przeciwnikach. Wynik meczu = **skumulowane** punkty rund.
- **Koniec meczu:** gdy KTOKOLWIEK osiągnie `target` skumulowanych punktów.
  **Domyślny `target = 5.**
- **UI: pełne N graczy** (reveal wszystkich rąk, tablica wyników N).
- **Home:** kafelek pokazuje realny status meczu; zakończone/anulowane **auto-znikają**;
  do zepsutych/swoich jest **„X"** → `rooms:close` (host zamyka pokój i anuluje
  niezakończony mecz → znika dla wszystkich).

## Fale i własność plików
- **1A (catalog/rps):** `catalog/rps/**` — punktacja parowa N, target dom. 5, view.
- **1B (backend):** `gate/app/socket-handlers/rooms/*`, `gate/app/services/games-client.ts`
  (jeśli trzeba), testy gate. (`rooms:close`, create z capacity/target.)
- **2A (web home/create):** `web/src/modules/home/*`, `web/src/modules/rooms/*`
  (CreateGameView), `web/src/stores/rooms/rooms.store.ts`, `web/src/styles/modules/home.scss`.
- **2B (web game-app):** `web/src/modules/game-app/*`, `web/src/composables/useMatchClient.ts`,
  `web/src/stores/games/games.model.ts`, `web/src/modules/games/{RpsHand,RpsIcon,RpsBoard?}`,
  `web/src/styles/modules/games.scss`.

Rozłączność 2A/2B: `rooms.store`+home (2A) vs game-app+games.model+RpsHand (2B). NIE nachodzić.

---

## KONTRAKT 1A — RPS N graczy (catalog/rps/src/rps.ts)

`RpsState` bez zmian pól (round, target, scores, seed, fallback) — `scores` to
skumulowane punkty parowe (mogą być UJEMNE).

`init`: `target = Math.max(1, Number(options?.target) || 5)` (było 2 → teraz **5**).
Reszta bez zmian (scores=0 dla wszystkich, seed, fallback per gracz).

`defaultMove`: bez zmian (fallback per gracz, deterministyczny random).

`resolve(state, moves: ResolvedMove[])` — UOGÓLNIĆ na N:
```
roundPoints: Record<pid, number>  // init 0 dla każdego moves[].playerId
for każda nieuporządkowana para (i, j) z moves:
    if beats(i.move, j.move): roundPoints[i]+=1; roundPoints[j]-=1
    else if beats(j.move, i.move): roundPoints[j]+=1; roundPoints[i]-=1
    // remis: bez zmian
scores[pid] += roundPoints[pid]   // kumulacja
finished = Math.max(...Object.values(scores)) >= target
roundWinner = pid z UNIKALNIE najwyższym roundPoints; remis na szczycie → null
```
`revealed = moves.map(m => ({ playerId, move, defaulted }))` (wszyscy).
**views per gracz** (każdy `moves[].playerId`):
```
{
  scores,                    // skumulowane po tej rundzie (wszyscy)
  target,
  yourMove: m.move,
  moves: revealed,           // ruchy WSZYSTKICH (jawne po sealu)
  roundPoints,               // punkty TEJ rundy per gracz (NOWE POLE)
  roundWinner,               // pid | null
}
```
`events: [{ type:'round', picks: revealed, points: roundPoints }]`.
Stan następnej rundy: `{ round+1, target, scores, seed, fallback }`.
`revealDurationMs: 1500`.

Determinizm zachować (harness). Testy: 2 graczy (parytet ze starą logiką: win +1 /
lose −1 / draw 0 — UWAGA: przegrany ma teraz −1, to zmiana), 3 graczy (np. rock/rock/scissors
→ dwaj z rock: +1 każdy vs scissors, remis między sobą → +1,+1,−2; sprawdź sumę=0),
remisy, spóźniony gracz z fallbackiem, finished przy target, scores ujemne.

## KONTRAKT 1B — backend (gate rooms)

`rooms:create` payload rozszerzyć o `capacity?` i `target?`:
- `capacity` = liczba graczy meczu (int ≥ 2; brak → 2). Waliduj min 2.
- `target` = próg zwycięstwa (int ≥ 1; brak → 5).
- `createMatch({ ..., capacity, options: { target } })` (dziś jest `capacity:2`,
  `options:{target:2}` na sztywno — sparametryzować z payloadu).

`rooms:close` NOWY handler:
- payload `{ roomId }`; wymaga `socket.user`; tylko host (`room.hostId === uid`).
- `store.setStatus(roomId, 'closed')`.
- jeśli `room.matchId`: sprawdź mecz (`client.getMatch`) — gdy faza ≠ `finished`/`cancelled`
  → `client.cancelMatch(room.matchId, 'cancelled')` (już istnieje z Etap 3B).
- ack `rooms:close-complete { roomId }` / `rooms:close-error { message }`.
- Zarejestruj w `createRoomsHandlers` (zwracana lista) i w barrel `index.ts` jeśli trzeba.

(games-client ma już `getMatch`, `cancelMatch`. Nie trzeba nowych komend games.)

## KONTRAKT 2A — web Home + tworzenie

**Ekran tworzenia** (`CreateGameView`): pole „liczba graczy" (number, min 2, dom. 2,
bez twardego max — sensowny soft-cap np. 8 w UI, ale nie blokuj) + „do ilu punktów"
(number, min 1, dom. 5). Przekaż do `rooms.createAndPlay(name, visibility, { capacity, target })`.
`rooms.store.createRoom/createAndPlay` dostają opcjonalny obiekt `{capacity,target}` i
przekazują w payloadzie `rooms:create`.

**Home kafelki** — status z meczu przez `useGamesStore().matchById(room.matchId)`
(games.store subskrybuje `matches` w AppLayout). Dla `myRooms`:
- brak matchId / match null → „Przygotowanie…"
- `phase==='lobby'` i `roster < capacity` → „Czeka na graczy (x/N)" (roster=players+guestIds)
- `phase==='lobby'` pełny lub `planning/resolving/revealing/paused` → „W toku"
- `phase==='finished'` lub `'cancelled'` → **auto-hide** (nie pokazuj kafelka)
- zepsuty (legacy: `phase==='planning'` a `roster < capacity`) → „Zepsuta"
Publiczne otwarte (`publicOpenRooms`) bez zmian (status 'open').
**Przycisk „X"** na kafelku MOJEJ gry (host) → `rooms.close(roomId)`. `rooms.store`:
dodaj `close(roomId)` (emit `rooms:close`) + obsługę acków `rooms:close-complete/-error`.

## KONTRAKT 2B — web ekran gry N graczy

`games.model.ts`: `RpsRoundView` dostaje `roundPoints: Record<string, number>`
(i już ma `scores`, `moves`, `roundWinner`). `Match` ma `players`, `guestIds?`, `capacity?`.

`useMatchClient.ts`: dodaj `players` (roster = players+guestIds), `opponents`
(roster bez `playerId`). Zachowaj `opponentId` (pierwszy z opponents) dla zgodności.

`GameRpsView.vue` (N graczy):
- **lobby/waiting:** lista wszystkich graczy w roster + `capacity`; „Czekam na graczy (x/N)".
  Gotowość (`lobbyReady`) pokazuj dla wszystkich. „Rozpocznij" jak w Etap 3B (gate liczy
  komplet+capacity). Odliczanie auto-startu jak jest.
- **reveal:** siatka rąk WSZYSTKICH graczy (`view.moves`), przy każdym wynik rundy z
  `view.roundPoints[pid]` (dodatni=zielony, ujemny=czerwony, 0=szary).
- **tablica wyników:** wszyscy gracze z `scores[pid]` + `target`, podświetl lidera.
- **finished:** zwycięzca = max `scores`; remis na szczycie → „Remis". Pokaż końcową tablicę.
- `RpsHand` reużyj per gracz; `RpsBoard`/układ na N (siatka). Style w `games.scss`.

Nazwy graczy: `playerLabel(id, meId)` (rps.consts) — dla N pokaż skrócone id/„Ty".

## Standardy
Zależności wstrzykiwane; testy bez sieci/bazy gdzie się da; `playerId`/host z tożsamości;
sandbox nie odpala testów/Dockera (odpala Piotr); git tylko Piotr; grep przed usunięciem.
Uwaga na determinizm RPS (replay-audit). Zmiana punktacji 2-graczy (przegrany −1) jest
ZAMIERZONA — zaktualizuj testy które zakładały stare +1/0.
