# ETAP 4d + 4e — KONTRAKT INTEGRACYJNY (źródło prawdy sesji 2026-07-12/3)

> Zakres: **4d** gry zewnętrzne casual (konta devów, rejestracja, katalog data-driven, handoff cross-origin) + **4e** ranked na grach wbudowanych (ELO, walkowery, kolejka szybkiego meczu) + **fixy z backlogu** (wyjście z gry, outcomeFor, etykiety odznak). Trzy rozłączne obszary: GAMES (games/), GATE (gate/), WEB (web/). Ten plik rozstrzyga nazwy, kształty i granice — przy wątpliwości kontrakt wygrywa z intuicją.
>
> Decyzje bazowe: ADR „Gry zewnętrzne = tylko towarzyskie" (ARCHITECTURE.md) — gry zewnętrzne NIGDY nie grają ranked; ranked wyłącznie wbudowane (RPS). Bundle/CSP nie istnieje. `docs/ETAP4_PLAN.md` sekcje 4d/4e.

## Rozstrzygnięcia otwartych pytań z ETAP4_PLAN (decyzje tej sesji)

- **Approve gier:** komenda socketowa admina + minimalny widok listy w istniejącym module admin (nie osobny panel).
- **Konto dewelopera:** self-service — `dev:enroll` nadaje rolę `developer` zalogowanemu userowi. Limit gier per konto: 5 (parametr w konfigu).
- **Edycja po publish:** zmiana `serviceUrl`/`uiUrl`/`manifest` cofa status do `registered` (wymaga ponownego approve).
- **Kolejka MVP:** FIFO + accept 10 s (dobór ELO jako czysta funkcja z konfigiem — użyta, gdy obaj mają rating; brak ratingu = traktuj jak 1200).

## 1. Kolekcje

### `games` — katalog gier (PUBLICZNA subskrybowalna; pisze WYŁĄCZNIE games)

```
_id:            string   // gameId, slug /^[a-z0-9-]{3,32}$/, podaje dev, unikalny; 'rps' zarezerwowane (builtin)
name:           string
builtin:        boolean  // true tylko dla first-party (RPS)
status:         'registered' | 'published' | 'unpublished'
devAccountId:   string | null   // userId właściciela; null dla builtin; ZAWSZE z tokenu, nigdy z payloadu
uiUrl:          string | null   // baza UI gry zewnętrznej (http(s)); null dla builtin
rankedEligible: boolean  // true TYLKO builtin (ADR)
manifest: {              // podzbiór PUBLICZNY manifestu — bez sekretów
  version:         string   // semver; musi się zgadzać z registrations.version (C3)
  minPlayers:      number   // ≥ 2
  maxPlayers:      number   // ≥ minPlayers
  planningPhaseMs: number   // ≥ 2000 — walidacja twarda
  defaultTarget?:  number
  badges?:         [{ badgeId: string, sentiment: 'positive'|'neutral'|'negative', labelKey?: string }]
  playerPrefs?:    object   // schemat prefs (kształt jak RPS)
}
createdAt, updatedAt, publishedAt?: number (epoch ms)
```

**UWAGA:** `serviceUrl` i `hmacSecret` NIE występują w tym dokumencie — żyją wyłącznie w prywatnej `registrations`. Katalog nie wymaga sanityzacji pól.

Polityka gate (row-level): `{ $or: [ { status: 'published' }, { devAccountId: user._id } ] }`; admin (permission jak w innych politykach adminowych, jeśli wzorzec istnieje — inaczej admin też widzi przez własne devAccountId/OR rozszerzone o rolę): agent GATE dostosowuje do istniejącego mechanizmu polityk, zachowując default-deny. Gość: tylko `{ status: 'published' }`.

### `ratings` (PUBLICZNA; pisze games)

```
_id:     string  // `${gameId}_${userId}` — deterministyczny upsert
gameId:  string
userId:  string
elo:     number  // start 1200
matches: number  // rozegrane mecze rankingowe
k:       number  // K użyte przy ostatniej aktualizacji (informacyjnie)
updatedAt: number
```

Polityka gate: publiczna (`{}` — pusty filtr, bez sanityzacji). Jeśli polityka `ratings` już istnieje z Etapu 1 — wyrównać do tego kształtu.

### `queue` (pisze games; odczyt TYLKO własnych wpisów)

```
_id:      string  // `${gameId}_${userId}`
gameId:   string
userId:   string  // NIGDY gość (g_*)
elo:      number  // snapshot z ratings przy join (brak = 1200)
since:    number  // epoch ms; „koniec kolejki" = nowy since
status:   'waiting' | 'proposed' | 'matched'
proposalId?:       string
proposalDeadline?: number  // now + 10 000 przy 'proposed'
matchId?:          string  // przy 'matched' — klient bierze handoff i wchodzi do gry
updatedAt: number
```

Polityka gate: `{ userId: user._id }` (istnieje z Etapu 1 — zweryfikować kształt pola).

### `matches` — nowe pola (pisze games)

```
eloApplied:      boolean          // idempotencja naliczenia ELO (default false)
walkover?:       { loserId: string, winnerId: string, reason: 'abandoned' | 'disconnected' } | null
defaultedStreak: { [pid]: number }  // kolejne rundy z defaultMove per gracz (reset przy własnym ruchu)
```

`ranked: true` ustawia WYŁĄCZNIE ścieżka kolejki (create-match z kolejki). Mecze z rooms/linków = zawsze `ranked: false`. Mecz z jakimkolwiek gościem nigdy nie jest ranked (kolejka i tak nie wpuszcza gości — podwójna gwarancja: create z kolejki tylko dla users).

## 2. games — nowe endpointy `/command/*` (internal secret, wzorzec z command-api.ts)

### 4d — rejestr

- `POST /command/register-game` `{ devAccountId, gameId, name, manifest, serviceUrl, uiUrl }`
  → walidacja: slug, unikalność (w tym vs builtin), manifest (planningPhaseMs ≥ 2000, minPlayers ≥ 2, maxPlayers ≥ minPlayers, sentiment odznak z enum, version semver), `serviceUrl`/`uiUrl` = poprawne http(s) URL; limit gier per dev (config, default 5).
  → generuje `hmacSecret` (crypto.randomBytes(32).toString('hex')) — zapis do `registrations` (serviceUrl, secret, version) + dokument `games` ze `status:'registered'`.
  → **odpowiedź: `{ gameId, hmacSecret }` — sekret zwracany TEN JEDEN RAZ**, nigdzie później nie do odczytania.
- `POST /command/update-game` `{ devAccountId, gameId, serviceUrl?, uiUrl?, manifest? }` — tylko właściciel (devAccountId == games.devAccountId, inaczej 403-owy błąd domenowy); KAŻDA zmiana → `status:'registered'` (ponowny approve). Nie zwraca sekretu; rotacja sekretu = poza MVP.
- `POST /command/approve-game` `{ gameId }` → `status:'published'`, `publishedAt` (autoryzacja ról po stronie gate).
- `POST /command/unpublish-game` `{ gameId }` → `status:'unpublished'`.

### 4e — kolejka + ranked

- `POST /command/queue-join` `{ gameId, userId }` → walidacja: gra istnieje, `rankedEligible`, userId nie jest `g_*`; upsert wpisu `waiting` (ponowny join = odśwież `since`? NIE — zachowaj `since`, idempotentny).
- `POST /command/queue-leave` `{ gameId, userId }` → usuwa wpis (w stanie 'proposed' = jak brak accept: druga strona wraca do 'waiting' bez zmiany `since`).
- `POST /command/queue-accept` `{ gameId, userId, proposalId }` → oznacza akcept; gdy OBAJ zaakceptowali: create-match (ranked:true, capacity:2, opcje domyślne z manifestu) → oba wpisy `status:'matched', matchId`; wpisy TTL-sprzątane po 60 s od matched (scheduler).
- `POST /command/abandon` `{ matchId, playerId }` → mecz ranked w fazie planning/resolving/revealing: finish z `walkover { loserId: playerId, winnerId: przeciwnik, reason:'abandoned' }` + naliczenie ELO wg reguł walkoweru. Mecz casual: odpowiedź `{ ok: true, noop: true }` (wyjście z casual nie kończy meczu — defaultMove gra dalej). Lobby: nie dotyczy (od tego jest rooms:close / cancel).

### Pętla matchmakera (w istniejącym schedulerze games — NOWY tick, nie osobny proces)

- co ~2 s: per gameId zbierz `waiting` posortowane po `since` (FIFO). Parowanie czystą funkcją `proposePairs(entries, config, now)` (osobny moduł `games/app/engine/matchmaker.ts`): okno |Δelo| ≤ 100 + 50 za każde pełne 10 s czekania (max 400) — przy MVP wszyscy mają 1200, więc efektywnie FIFO. Para → oba wpisy `status:'proposed'`, wspólny `proposalId`, `proposalDeadline = now + 10 000`.
- deadline minął bez obu akceptów: kto zaakceptował → `waiting` (bez zmiany `since`); kto nie → `waiting` z `since = now` (koniec kolejki — reguła planu).
- Watchdog matched: wpisy `matched` starsze niż 60 s → delete.

### ELO — czysty moduł `games/app/engine/elo.ts` + wpięcie w finish

- `expected(a, b) = 1 / (1 + 10^((b - a) / 400))`; K(gracz): `matches < 30 → 32`, `elo ≥ 2400 → 10`, inaczej `16` (konfig, nie stałe w kodzie).
- Normalny finish (ranked, bez walkoweru): zwycięzca = argmax score; remis na szczycie = 0.5/0.5. `delta = K * (score − expected)`.
- **Walkower:** porzucający — przegrana z PEŁNYM jego K; wygrany — wygrana z **K/2**.
- Aplikacja: w ścieżce apply-result finish (transakcja jak reszta zapisu wyniku, jeśli wykonalne — inaczej bezpośrednio po commit z `eloApplied` gardą): warunki `ranked && !eloApplied && guestIds.length === 0`. Upsert do `ratings` (elo, matches+1, k), `matches.eloApplied = true`.
- **Czysta funkcja replay:** `replayElo(results: {winnerId|null, loserId|null, walkover?}[], config)` — test odtwarza stan ratings z sekwencji wyników (zasada E1).

### Walkower z rozłączenia (silnik)

- Przy seal: gracze bez złożonego ruchu = defaulted → `defaultedStreak[pid]++`; złożony ruch → reset do 0.
- Po zastosowaniu wyniku rundy: jeśli `ranked` i `defaultedStreak[pid] ≥ 2` → finish z `walkover { loserId: pid, reason:'disconnected' }` + ELO wg walkoweru. (Przy 2 graczach naraz — mecz cancelled bez ELO; przypadek patologiczny.)

### Hak na bota (scaffold, Etap 5)

`games/app/engine/bot-provider.ts`: `interface BotProvider { maybeJoinLobby(match): Promise<void> }` + `noopBotProvider`. Wpięty (wywołanie) w tick schedulera dla meczów w lobby z wolnym slotem. Komentarz: pełna implementacja = Etap 5 (pułapki/zawodnik).

### Seed katalogu builtin

`db/scripts/register-rps.sh` rozszerzyć o idempotentny upsert dokumentu `games`: `{ _id:'rps', name:'Papier, kamień, nożyce', builtin:true, status:'published', rankedEligible:true, devAccountId:null, uiUrl:null, manifest: { version:'1.0.0', minPlayers:2, maxPlayers:8, planningPhaseMs: <z manifestu rps>, ... } }`.

## 3. gate

### Modele (odczyt/initial-load subskrypcji): `games`, `ratings`, `queue` — wg istniejącego wzorca (jak matches/match_views; sprawdzić jak rozwiązano „initial-load kolekcji bez modelu gate" z Etapu 2 i użyć tego samego mechanizmu).

### Polityki (policies.ts): `games` (OR published/własne — patrz §1), `ratings` (publiczna), `queue` (własne wpisy — zweryfikować istniejącą).

### Nowe komendy socketowe (wzorce nazw i błędów jak istniejące `friends:*`/`games:*`; identyfikatory ZAWSZE z tokenu)

| Event | Payload | Complete | Uwagi |
|---|---|---|---|
| `dev:enroll` | `{}` | `dev:enroll-complete` | dodaje rolę `developer` userowi z tokenu (self-service); idempotentny |
| `dev:register-game` | `{ gameId, name, manifest, serviceUrl, uiUrl }` | `dev:register-game-complete { gameId, hmacSecret }` | wymaga roli developer; devAccountId z tokenu; sekret przechodzi JEDEN raz |
| `dev:update-game` | `{ gameId, serviceUrl?, uiUrl?, manifest? }` | `dev:update-game-complete` | właściciel; status wraca do registered |
| `admin:games-approve` | `{ gameId }` | `admin:games-approve-complete` | permission adminowy (istniejący mechanizm check-permission) |
| `admin:games-unpublish` | `{ gameId }` | `admin:games-unpublish-complete` | jw. |
| `queue:join` | `{ gameId }` | `queue:join-complete` | tylko `socket.user` (gość NIE); userId z tokenu |
| `queue:leave` | `{ gameId }` | `queue:leave-complete` | jw. |
| `queue:accept` | `{ gameId, proposalId }` | `queue:accept-complete` | jw. |
| `games:abandon` | `{ }` | `games:abandon-complete` | na SOCKECIE TOKENU MECZU (jak submit-move) — matchId+playerId z tokenu meczu |

Błędy: wzorzec `<event>-error { message }` jak w istniejących handlerach. Rate-limit jak w chat (istniejący socket-rate-limit).

### CORS `/auth/match-token` (api/index.ts)

Origin dozwolony gdy: `origin === WEB_URL` LUB origin należy do zbioru originów `uiUrl` gier `{ status:'published', uiUrl != null }` (odczyt modelu `games`, cache in-memory 60 s). Inny origin → BRAK nagłówka ACAO (przeglądarka utnie). `/rooms/join-guest` zostaje WEB_URL-only. Porównanie po pełnym originie (scheme+host+port) wyliczonym z `new URL(uiUrl).origin`.

### `games:request-handoff` — zweryfikować, że jest game-agnostic (kod handoff per matchId); jeśli zaszyte 'rps' — odszyć.

## 4. web

### Katalog data-driven
- Subskrypcja `games` (nowy store `catalog` w `stores/games/` lub obok rooms — decyzja agenta WEB, byle spójnie). Home/`CreateGameView`: lista gier z katalogu zamiast hardcode `RPS_GAME_ID` (builtin + published zewnętrzne). Gra zewnętrzna: badge/etykieta „UI poza platformą" (i18n).
- Wejście do gry: builtin → dotychczasowa ścieżka `/game/rps?handoff=…`; zewnętrzna → `window.location.href = uiUrl + '?handoff=' + code + '&return=' + encodeURIComponent(platformOrigin)`. Przy PIERWSZYM przejściu na zewnętrzną grę: modal ostrzegawczy (i18n): „Przechodzisz do aplikacji dewelopera. Gra NIGDY nie prosi o hasło platformy." (zapamiętane w localStorage per gameId).

### Widok deva „Moje gry" (`/dev`, nowy moduł `modules/dev/`)
- CTA „Zostań deweloperem" (dev:enroll) gdy brak roli; formularz rejestracji (gameId, name, serviceUrl, uiUrl, manifest jako pola: minPlayers, maxPlayers, planningPhaseMs, version + odznaki opcjonalnie); po complete — hmacSecret pokazany RAZ z przyciskiem kopiuj + ostrzeżenie; lista własnych gier ze statusem (subskrypcja `games` łapie własne przez politykę); edycja (update → wraca do registered — komunikat).
- Pozycja w dropdownie profilu (jak Preferencje).

### Admin: approve
- W module admin nowy widok/lista: gry `status:'registered'` (subskrypcja games — admin musi je widzieć wg polityki) + przyciski Approve/Unpublish (`admin:games-approve`/`-unpublish`). Guard istniejącym mechanizmem uprawnień.

### Ranked (4e)
- Home: kafelek „Szybki mecz" dla gier `rankedEligible` → `queue:join` → stan oczekiwania (subskrypcja `queue` — własny wpis; pokazuj czas od `since`) → `status:'proposed'`: dialog accept z odliczaniem do `proposalDeadline` (przycisk → `queue:accept`; brak = samo wygaśnie) → `status:'matched'` + `matchId`: `games:request-handoff` → redirect `/game/rps?...`. Anuluj oczekiwanie = `queue:leave`.
- Profil (`/u/:id` + własny): sekcja ELO per gra (subskrypcja `ratings` po userId).
- Ranking gry: widok/lista top wg elo (subskrypcja `ratings` po gameId, sort klientem, limit 50) — wejście z kafelka gry lub profilu; minimalistycznie.
- `GameRpsView`: oznaczenie meczu rankingowego (badge „Ranked", i18n) — pole `matches.ranked` już przychodzi subskrypcją.

### Fixy z backlogu (HANDOFF „Do adresacji")
1. **Wyjście z `/game/rps`** — trwały afordans (przycisk w rogu, zawsze widoczny poza error/finished, gdzie goBack już jest):
   - host w lobby (roster niepełny) → modal potwierdzenia → `rooms:close {roomId}` (rozwiązać roomId z `matches.roomCode`/istniejącego stanu rooms; jeśli brak w stanie — dopuszczalne wyjście przez `games:abandon`+nawigacja, ale preferuj rooms:close) → nawigacja na `return`/Home;
   - gracz, mecz casual w toku → modal „mecz będzie kontynuowany, dostaniesz ruchy domyślne" → nawigacja (BEZ komendy);
   - gracz, mecz ranked w toku → modal „to walkower — przegrasz z pełną karą" → `games:abandon` (socket meczu) → nawigacja.
2. **`outcomeFor`** — etykieta rundy z `roundWinner`/`winner` z eventu (unikalny lider = win, remis na szczycie = draw, reszta = lose), NIE ze znaku punktów.
3. **Etykiety odznak** — mapa i18n `community.badges.<badgeId>` z fallbackiem na surowe `badgeId`; klucze dla odznak RPS jeśli istnieją w manifeście.

### i18n: nowy ns `dev` + rozszerzenia `home`/`games`/`community`/`common`; en = `typeof pl` (parytet przez typ — wzorzec Fali 3). Teksty testów PO POLSKU (vitest locale pl).

## 5. Testy (każdy obszar pisze swoje; wzorce istniejące)

- **GAMES (unit):** walidacja manifestu (planningPhaseMs<2000 odrzucone, zły slug, duplikat, limit per dev); update cofa status; elo.ts (K progi, remis, walkower pełne/pół K); replayElo z sekwencji; matchmaker.proposePairs (FIFO, okno, rozszerzanie, max); accept-timeout wraca na koniec; abandon: ranked=walkower+ELO, casual=noop; defaultedStreak→walkower; eloApplied idempotencja; mecz z gościem nie dotyka ELO; cancelled nie dotyka ELO.
- **GAMES (integration, RS 27140):** pełny przepływ queue-join×2 → proposed → accept×2 → matched → mecz ranked → finish → ratings zapisane; walkower przez abandon.
- **GATE:** polityki `games` (szpieg NIE widzi cudzych `registered`; gość widzi tylko published; dev widzi własne registered), `ratings` publiczna, `queue` tylko własne (rozszerzenie S1); dev:register-game wymaga roli; devAccountId z tokenu (payload z cudzym id ignorowany); admin:games-approve wymaga uprawnienia; queue:* odrzuca gościa; CORS match-token: zarejestrowany origin OK, niezarejestrowany BEZ ACAO, WEB_URL OK; games:abandon tylko z tokenem meczu.
- **WEB:** katalog renderuje builtin+published z etykietą zewnętrznych; przepływ kolejki (join→proposed dialog→matched redirect) na mockach store; przycisk wyjścia: 3 warianty modali i komend; outcomeFor wg winner; badge fallback; parytet i18n (typ).

## 6. Zasady środowiska (KRYTYCZNE — z HANDOFF)

- Pliki edytować WYŁĄCZNIE narzędziami Read/Write/Edit — **NIGDY bash** (`sed -i`, `printf >>` = uszkodzenie pliku przez niezsynchronizowany mount). Czytać też preferencyjnie narzędziami (bash mount bywa stale).
- NIE odpalać `npm`/testów/Dockera (sandbox nie może) — testy pisać, uruchomi Piotr.
- Komentarze/kod po polsku (styl repo), TypeScript, wzorce DI jak w istniejących plikach (command-api/engine są wstrzykiwalne — nowe funkcje też mają być).
- Identyfikatory zawsze z tożsamości tokenu, nigdy z payloadu. Kolekcje prywatne pozostają niesubskrybowalne (default-deny).
- Granice plików: GAMES nie dotyka gate/ i web/; GATE nie dotyka games/ i web/ (poza odczytem typów); WEB nie dotyka backendów. Wspólny słownik = TEN plik.
