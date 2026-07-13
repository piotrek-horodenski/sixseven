# Etap 4f — Bot-zawodnik (kontrakt integracyjny)

> Źródło prawdy dla implementacji. Dodatek do Etapu 4: pełna realizacja „haka na bota"
> ze scaffoldu 4e (`games/app/engine/bot-provider.ts`). Decyzja Piotra (sesja 2026-07-13):
> bot dołącza do gry, gdy brak przeciwnika.

## Decyzje (potwierdzone z Piotrem — do ADR w ARCHITECTURE.md)

1. **Zakres = tylko lobby (casual).** Bot dosiada do otwartych gier w lobby z wolnym
   slotem. Lobby jest z definicji casual (`ranked=false`), więc ELO nigdy się nie
   nalicza — problem farmingu nie istnieje. Bot w kolejce szybkiego meczu (ranked) =
   świadomie POZA MVP (osobna, cięższa decyzja o farmingu).
2. **ELO = zero.** Mecz z botem nie dotyka ratingu. Realizacja darmowa: bot żyje w
   `matches.guestIds`, a `settleMatchElo` już pomija mecze z niepustym `guestIds`, zaś
   `applyEloIfDue` iteruje wyłącznie `players`. Bot nigdy nie dostaje wpisu `ratings`.
3. **Subtelny sygnał.** Bot NIE jest ukrywany przed graczem. UI pokazuje dyskretny
   marker (ikona/etykieta), detekcja po prefiksie id `bot_`. (Odrzucono pełną
   nieodróżnialność — prawdomówność wobec gracza.)
4. **Bot LOSUJE ruch — nie polega na `defaultMove`.** Bot aktywnie składa losowy ruch
   co rundę (trafia do prywatnej `moves`). To ważne: `defaultMove` dla gościa bez
   preferencji = `hashMove(seed, botId, round)` — deterministyczny i PRZEWIDYWALNY
   (przeciwnik zna publiczny seed → policzy ruch z góry). Aktywne złożenie ruchu jest
   też w pełni replay-safe: ruch jest ZAPISANY, więc audyt czyta go z zapisu (determinizm
   dotyczy tylko ruchów NIEzłożonych).
5. **MVP = tylko RPS, przestrzeń ruchów na sztywno.** Platforma jest agnostyczna wobec
   reguł gry, więc losowy PRAWIDŁOWY ruch musiałby pochodzić z gry (kontraktowy
   `/bot-move` albo deklaracja w manifeście). Świadomie odłożone: MVP zaszywa
   `{rock, paper, scissors}` w module bota i dosadza bota WYŁĄCZNIE do gier z zaszytą
   strategią (dziś: `rps`). Gra zewnętrzna/arrowsoccer → wymaga później drogi kontraktowej
   (DŁUG, sekcja niżej).

## Tożsamość bota

- **id:** `bot_<hex>` (wzór jak goście `g_<…>`; syntetyczny, nie 24-hex ObjectId).
- **Miejsce w meczu:** `matches.guestIds` (NIE `players`). Konsekwencje pozytywne:
  roster/scoring/reveal/`defaultMove` iterują `players ∪ guestIds` → bot uczestniczy;
  ELO wyklucza gości → bot nie farmi ratingu; `applyEloIfDue` (iteruje `players`) nigdy
  nie zakłada bota do `ratings`.
- **Nick:** `matches.nicks[botId] = 'Bot'` (neutralny; UI lokalizuje etykietę po prefiksie,
  nie po nicku — patrz „i18n na serwerze" jak przy „Gra {author}").
- **Detekcja:** `isBotId(id) = id.startsWith('bot_')` — wspólny helper (games + web).

## games — zmiany

### `engine/bot-provider.ts` (realna implementacja)

Zastępuje noop. Fabryka `createBotProvider(deps, config)` zwracająca `BotProvider`:

```
interface BotProviderDeps {
  getRegistration(gameId): Promise<{ version, endpoint:{url,secret} } | null>
  init(endpoint, InitRequest): Promise<{ ok, state }>
  loadPlayerMemory(gameId, playerIds): Promise<PlayerData>
  addPlayer(matchId, playerId, kind:'guest', initialState, nick): Promise<AddPlayerResult>
  playerReady(matchId, playerId): Promise<void>
  submitMove(matchId, playerId, move): Promise<'accepted'|'rejected'>
  hasSubmitted(matchId, round, playerId): Promise<boolean>
  genSeed(): string
  now(): number
  genBotId(): string           // 'bot_' + hex
}
interface BotConfig {
  enabled: boolean             // BOT_ENABLED, default true
  joinWaitMs: number           // BOT_JOIN_WAIT_MS, default 15000 — ile pusty slot czeka
  nick: string                 // 'Bot'
  strategies: Record<gameId, () => move>   // MVP: { rps: randomRpsMove }
}
```

**`maybeJoinLobby(match: LobbyMatchInfo)`** — dosadza bota/boty do lobby:
- guard `config.enabled`; guard `strategies[match.gameId]` istnieje (MVP: tylko `rps`);
- guard progu: `now - match.createdAt >= joinWaitMs` (pusty slot musi „poczekać");
- guard „jest człowiek": `players.length + guestIds.filter(!isBot).length >= 1`
  (nie tworzymy meczów samych botów);
- pętla wypełniania do `capacity`: dopóki wolny slot → dołóż JEDNEGO bota:
  `roster = [...players, ...guestIds, botId]`; `loadPlayerMemory` (bot = puste);
  `init(reg.endpoint, {matchId, manifestVersion, playerIds:roster, seed:genSeed(),
  playerData, options})`; `addPlayer(matchId, botId, 'guest', initRes.state, nick)`;
  przerwij pętlę na wyniku ≠ `'added'` (`full`/wyścig);
- po dołożeniu: `playerReady(matchId, botId)` dla każdego bota (auto-gotowość) — to też
  wyzwala `engine.start`, jeśli człowiek już był gotowy i roster pełny.

**`maybePlay(match: PlanningMatchInfo)`** — bot składa losowy ruch:
- `{ matchId, gameId, round, botIds }`; `strat = strategies[gameId]`; brak → return;
- dla każdego `botId`: jeśli `!(await hasSubmitted(matchId, round, botId))` →
  `submitMove(matchId, botId, strat())`. Guard `hasSubmitted` = dokładnie raz na rundę
  (idempotencja przy pollingu schedulera; ponowne submit i tak nie emituje zdarzeń — A3).

Eksport: `createBotProvider`, `isBotId`, `randomRpsMove` (crypto-losowy z `['rock','paper',
'scissors']`), `noopBotProvider` (zostaje na testy rdzenia).

Rozszerzenie `LobbyMatchInfo` o `manifestVersion: string` i `options: Record<string,unknown>`
(potrzebne do `/init`). Nowy `PlanningMatchInfo { matchId, gameId, round, botIds }`.

### `engine/engine.ts`

- Nowy helper `hasMove(matchId, round, playerId): Promise<boolean>` — cienka nakładka na
  `Move.exists({ matchId, round, playerId, ready:true })`. (Do `hasSubmitted` providera.)
- Bez zmian w ELO: bot w `guestIds` już wyklucza mecz z ratingu. (Dla pewności: test
  regresyjny, że mecz z `bot_` w guestIds nie nalicza ELO nawet gdyby ktoś ustawił
  `ranked`.)

### `engine/scheduler.ts`

- `botTick()` (istnieje): rozszerza `LobbyMatchInfo` o `manifestVersion`, `options`.
- Nowy `botPlayTick()`: `Match.find({ phase:'planning' })` → filtr JS na `guestIds` z
  prefiksem `bot_` → `provider.maybePlay({matchId, gameId, round, botIds})`. Wywoływany w
  TYM SAMYM dławionym bloku co `queueTick`/`botTick` (co `tickIntervalMs` ≈ 2 s).
- Domyślny provider dalej `noopBotProvider` (testy rdzenia/deadline bez botów).

### `command-api.ts`

- `export`-ować `defaultLoadPlayerMemory` (reuse w `app.ts` do providera).

### `settings.ts`

- `BOT_ENABLED` (default `'true'`), `BOT_JOIN_WAIT_MS` (default `'15000'`). Ekspozycja
  `settings.botEnabled`, `settings.botJoinWaitMs`.

### `app.ts` (wiring)

- Zbudować `botProvider = createBotProvider({ getRegistration: (ta sama logika co w
  command deps), init: callInit, loadPlayerMemory: defaultLoadPlayerMemory,
  addPlayer/playerReady/submitMove/hasSubmitted: przez `engine`, genSeed, now, genBotId },
  { enabled: settings.botEnabled, joinWaitMs: settings.botJoinWaitMs, nick:'Bot',
  strategies:{ rps: randomRpsMove } })`.
- `new Scheduler(engine, undefined, undefined, undefined, { botProvider })`.

## web — zmiany

- Helper `isBot(id) = id.startsWith('bot_')` (np. `web/src/modules/game/bot.ts` albo obok
  `playerLabel`).
- Render markera w `GameRpsView`: lista graczy w lobby, siatka rąk w reveal, tablica
  wyników — przy id bota dyskretna ikona (np. `faRobot`) + etykieta `t('games.bot.label')`.
  NIE nachalnie: mały badge obok nicku.
- i18n ns `games` (pl/en, parytet `typeof pl`): `games.bot.label` = „Bot" / „Bot",
  `games.bot.tooltip` = „Gracz komputerowy dosadzony, bo brakowało przeciwnika." /
  „Computer player added because no opponent was available."
- Zarejestrować `faRobot` w `font-awesome.config.ts` (jeśli używane).

## Testy do CI

- `bot-provider.test.ts` (unit, wszystkie deps mockowane):
  - `maybeJoinLobby`: NIE dosiada przed `joinWaitMs`; dosiada po; NIE gdy pełno; NIE gdy
    brak człowieka; NIE dla gry spoza `strategies`; dołożony bot → `addPlayer` kind=`guest`
    + `playerReady`; wypełnia do `capacity` (np. 2 boty do 3-osobowego z 1 człowiekiem).
  - `maybePlay`: składa ruch, gdy bot nie złożył; NIE składa drugi raz (`hasSubmitted`);
    ruch ∈ `{rock,paper,scissors}`; brak strategii → no-op.
  - `isBotId`/`randomRpsMove`: prefiks, rozkład (nie zawsze ta sama wartość — statystyka).
- `scheduler` (rozszerzenie `matchmaker.test.ts`/nowy): `botPlayTick` woła `maybePlay` dla
  meczów planning z botem; `botTick` woła `maybeJoinLobby` z `manifestVersion`/`options`.
- `engine`: regresja „mecz z bot_ w guestIds nie nalicza ELO".

## Akceptacja (live u Piotra)

Człowiek zakłada grę RPS w lobby i czeka; po `BOT_JOIN_WAIT_MS` dosiada się „Bot"
(z markerem); mecz startuje; co rundę bot gra losowo (rock/paper/scissors zmienia się między
rundami); mecz kończy się normalnie; profil/ranking gracza BEZ zmian ELO; mecz nie tworzy
wpisu `ratings`.

## DŁUG / świadome uproszczenia

- **Przestrzeń ruchów zaszyta w platformie (tylko RPS).** Właściwa droga = kontraktowy
  `/bot-move` (gra zwraca losowy legalny ruch z własnej entropii — ogólne, działa dla
  arrowsoccera) albo deklaracja przestrzeni ruchów w manifeście. Konieczne przed botem dla
  gier zewnętrznych. (Sesja 2026-07-13: Piotr wybrał MVP-na-sztywno.)
- **Bot gra niemal natychmiast** (≤ tickIntervalMs od otwarcia planning) — brak „ludzkiego"
  opóźnienia/jittera. Dług UX; łatwy do dołożenia (losowe opóźnienie w oknie planning).
- **Bot tylko casual/lobby.** Ranked-backfill botem = osobna decyzja (farming).
- **guestIds sprzątane przez feature'y gościa?** `guest:convert`/`guest-matches` operują na
  guestId Z TOKENU konkretnego gościa — id bota nie jest w niczyim tokenie, więc bot nie
  wpadnie do konwersji. (Zanotowane; brak realnego ryzyka w MVP.)
- **Jeden bot na tick w meczu** — pętla wypełnia do capacity w jednym `maybeJoinLobby`, ale
  N botów = N wywołań `/init` (rosnący roster). Dla domyślnych 2-os. gier = 1 bot.
