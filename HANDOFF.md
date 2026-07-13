# HANDOFF — kontekst sesji dla kontynuacji

> Cel pliku: pełny reset sesji nie może kosztować kontekstu. Nowa sesja: przeczytaj ten plik, potem `README.md` (mapa dokumentacji). Cała wiedza projektowa jest w dokumentach — ten plik mówi, jak z nich korzystać i co jest między wierszami.

## Stan projektu (2026-07-12)

**AKTUALIZACJA (sesja 2026-07-13, druga): Etap 4f — BOT-ZAWODNIK NAPISANY (sekcja „Etap 4f" niżej) — czeka na weryfikację live Piotra. Etap 4d+4e ZWERYFIKOWANE NA ŻYWO i zacommitowane (`630433f`), z drobnymi „DO DOMKNIĘCIA" (sekcja 4d+4e). Cały Etap 4 (4a–4f) domknięty co do implementacji; następny duży ruch wg planu = Etap 5 (trust+judge+snajperzy).**

**Faza: kod ISTNIEJE. Etapy 0, 1, 2 zaimplementowane i przeszły na żywo. Etap 3 (UI/przepływ „gry", N-graczy) ZROBIONY i ZWERYFIKOWANY na żywo. Fala 3 (i18n pl/en) POTWIERDZONA. Etap 4 — podetapy 4a+4b+4c (społeczność: presence+znajomi, czat+profile+adnotacje-odczyt, konwersja gościa) ZAIMPLEMENTOWANE (5 agentów + integracja) i ZWERYFIKOWANE NA ŻYWO (sesja 2026-07-12): presence live, znajomi (invite po nazwie/accept/remove), czat DM 1:1 + czat w meczu, profile z historią+odznakami, BRAMKA adnotacji (negatywna niewidoczna dla obcych) OK, konwersja gościa, nicki w grze, link zaproszenia w lobby. Testy jednostkowe gate/web + integracyjne games ZIELONE u Piotra. Committed. 4d (bundle+CSP) — plan ZMIENIŁ SIĘ w międzyczasie, przeczytać `docs/ETAP4_PLAN.md` na nowo przed implementacją. 4e (ranked) — bez zmian, twardo zależy od 4d. ZALEGŁY BUG: patrz niżej „Do adresacji w nowej sesji".**

## Etap 4f — Bot-zawodnik — NAPISANY (sesja 2026-07-13)

> Kontrakt (źródło prawdy): `docs/ETAP4F_BOT_CONTRACT.md`. ADR: ARCHITECTURE.md „Bot-zawodnik — casual, zero ELO, subtelny sygnał". **Sandbox nie odpala testów/Dockera — czeka na weryfikację Piotra.**

**Decyzje Piotra (AskUserQuestion):** (1) zakres = tylko lobby (casual); (2) ELO = zero (bot jak gość); (3) rozpoznawalność = subtelny sygnał (nie ukrywamy botowości); (4) bot LOSUJE ruch (nie polega na defaultMove — ten jest deterministyczny/przewidywalny z publicznego seedu); (5) MVP = tylko RPS, przestrzeń ruchów zaszyta.

**Zakres zrobiony (pełna implementacja „haka na bota" ze scaffoldu 4e):**
- **games** — realny `createBotProvider` w `engine/bot-provider.ts` (zastąpił noop): `maybeJoinLobby` (po progu `BOT_JOIN_WAIT_MS`=15 s, gdy czeka człowiek i wolny slot, tylko gry z zaszytą strategią → dosadza `bot_<hex>` w `guestIds`, reuse `/init` pełnego rosteru + `engine.addPlayer(kind='guest')` + `engine.playerReady`, wypełnia do capacity); `maybePlay` (mecz w planning z botem → `engine.submitMove(botId, losowy RPS)`, guard `hasSubmitted` = raz na rundę). Nowy `engine.hasMove`. Scheduler: `botTick` rozszerzony o `manifestVersion`/`options`, nowy `botPlayTick` w dławionym bloku (~2 s). `settings`: `BOT_ENABLED`, `BOT_JOIN_WAIT_MS`. Wiring w `app.ts` (wspólny `getRegistration`; `defaultLoadPlayerMemory` wyeksportowany).
- **Tożsamość:** bot w `guestIds` → wykluczony z ELO DARMOWO (`settleMatchElo` pomija gości; `applyEloIfDue` iteruje tylko `players`). Ruch bota trafia do prywatnej `moves` → replay-safe.
- **web** — `isBot(id)` (prefiks) w `rps.consts.ts`; subtelny marker (ikona `robot` + tooltip) w `GameRpsView` (scoreboard, roster lobby ×2, finished); i18n `games.bot.{label,tooltip}` pl/en; `faRobot` już był zarejestrowany. Styl `.bot-badge` w `games.scss`.
- **Testy:** `games/tests/engine/bot-provider.test.ts` (16 przypadków: progi, obecność człowieka, wspierane gry, wypełnianie do capacity, wyścig „full", init-fail, losowość i guard `hasSubmitted`, wiele botów).

**Weryfikacja Piotra (4f):**
1. `npm test --workspace games` (nowy `bot-provider.test.ts`) + `npm test --workspace web` (parytet i18n `games.bot`).
2. `npx vue-tsc --noEmit` w web + `npm run build --workspace games`.
3. `docker compose up -d --build games web`.
4. Smoke: załóż grę RPS w lobby, czekaj ~15 s → dosiada „Bot" (marker); mecz startuje; bot gra co rundę losowo (ruch zmienia się między rundami); mecz kończy się; profil/ranking BEZ zmian ELO; `db.ratings` bez wpisu dla bota; `db.matches.findOne({_id:...}).guestIds` zawiera `bot_…`.

**NAPRAWIONE (mobile, po live-teście 4f):** na telefonie panel `aside` (znajomi, zawsze aktywny na Home) zasłaniał/spychał kafelki i „Nowa gra". Przyczyna: `$aside-width: 36rem` (576px) z `flex-shrink:0` + BRAK jakiegokolwiek breakpointu w `layout.scss` — sztywna kolumna szersza niż ekran. Fix: media query `≤56rem` w `layout.scss` układa sloty `sidebar`/`aside` PIONOWO (treść pełną szerokością na górze, panel pod spodem; puste sloty `display:none`; nadpisania o równej specyficzności, później w źródle). Desktop bez zmian. **Wymaga rebuild web.** (Ekran gry `/game/rps` jest standalone bez slotu aside — nietknięty.)

**DŁUG 4f:** przestrzeń ruchów zaszyta w platformie (tylko RPS) — właściwa droga = kontraktowy `/bot-move` albo deklaracja w manifeście (KONIECZNE przed botem dla gier zewnętrznych/arrowsoccera); bot gra niemal natychmiast (brak ludzkiego jittera); ranked-backfill botem poza MVP (farming); host-toggle „dopuść boty" = globalny `BOT_ENABLED`, per-mecz = follow-up.

## Etap 4d+4e + fixy backlogu — NAPISANE i ZWERYFIKOWANE NA ŻYWO (sesja 2026-07-12/13)

**Status weryfikacji (2026-07-13, live u Piotra):** testy jednostkowe gate/web/games ZIELONE (po 3 fixach z live-testu — sekcja BUGI niżej). Na żywo POTWIERDZONE: szybki mecz (kolejka→accept→mecz ranked), walkower przez „Wyjdź", ścieżka deva end-to-end (enroll→rejestracja `planing-poker`→approve→CORS: origin z uiUrl dostaje ACAO po TTL 60 s, obcy origin nie). DO DOMKNIĘCIA: liczbowa weryfikacja połowy K (świeże konta: walkower = 1208/1184, zwykła wygrana = 1216/1184); pełny e2e gry zewnętrznej na realnej domenie deva — wymaga pierwszej prawdziwej zewnętrznej gry (kandydat: snajperzy, Etap 5); testowa gra-widmo `planing-poker` (serviceUrl nieosiągalny — 4d nie waliduje osiągalności, to Etap 5) do zdjęcia adminem (Unpublish).

> Kontrakt integracyjny (źródło prawdy): `docs/ETAP4_DE_CONTRACT.md`. Wzorzec: 3 agenci (GAMES/GATE/WEB) na rozłącznych obszarach + audyt domykający (2 agentów po ucięciu sesji limitem) + integrator. **Sandbox nie odpalał testów/Dockera — wszystko poniżej wymaga weryfikacji Piotra.**

**4d (gry zewnętrzne casual):** kolekcja `games` (katalog, pisze games; polityka: published-lub-własne-deva, admin `manage-games` widzi wszystko, gość tylko published); `/command/register-game|update-game|approve-game|unpublish-game` (walidacje manifestu, limit 5 gier/dev, hmacSecret zwracany RAZ, update cofa do `registered`); gate: `dev:enroll` (self-service rola developer), `dev:register-game`, `dev:update-game`, `admin:games-approve/-unpublish`; CORS `/auth/match-token` per origin zarejestrowanych `uiUrl` (cache 60 s, brak ACAO dla obcych); web: katalog data-driven (Home/CreateGameView), moduł `/dev` (formularz, sekret raz, lista, edycja), widok admin approve, redirect na `uiUrl?handoff=…` z jednorazowym modalem „gra nigdy nie prosi o hasło platformy". Seed RPS w katalogu: `db/scripts/register-rps.sh` (builtin, published, rankedEligible).

**4e (ranked wbudowane):** `ratings` (publiczna) + `queue` (własne wpisy); `engine/elo.ts` (K 32/16/10 konfig, walkower pełne/pół K, `replayElo` E1) wpięty w 3 ścieżki finiszu z idempotencją `eloApplied` (transakcyjnie); walkower z rozłączenia (`defaultedStreak` ≥2 w ranked; obaj naraz → cancel bez ELO); `engine/matchmaker.ts` (`proposePairs`: FIFO + okno |Δelo|≤100+50/10 s max 400) + tick w schedulerze (2 s), accept 10 s, timeout: akceptujący bez zmiany `since`, nieakceptujący na koniec kolejki, matched sprzątane po 60 s; `/command/queue-join|leave|accept|abandon`; gate `queue:join/leave/accept` (tylko user, NIE gość) i `games:abandon` (tylko socket TOKENU MECZU); web: kafelek „Szybki mecz" + `QuickMatchOverlay` (waiting→proposed→matched→handoff), ELO na profilu, `/ranking/:gameId` (top 50), badge „Rankingowy" w grze. Bot: scaffold `engine/bot-provider.ts` (noop, Etap 5).

**Fixy backlogu (web):** (1) trwały przycisk „Wyjdź" z `/game/rps` — host w lobby→`rooms:close`, casual→sama nawigacja (modal informacyjny), ranked→modal „walkower"→`games:abandon` socketem meczu; (2) `outcomeFor` z `roundWinner` (nie ze znaku punktów — dług winner-only zamknięty); (3) etykiety odznak `community.badges.<badgeId>` z fallbackiem.

**Fix integratora (bezpieczeństwo):** legacy `games:create-match` w gate przepuszczał `ranked` z payloadu KLIENTA → usunięte (ranked ustawia wyłącznie ścieżka kolejki w games) + test regresji w `gate/tests/handlers/games.test.ts`.

**BUGI Z LIVE-TESTU (naprawione 2026-07-12/3):** (1) nowy CORS `/auth/match-token` przepuszczał TYLKO dokładny origin `WEB_URL` — a z ustawionym `HOST_IP` (telefon) desktop chodzi po `http://localhost:5273` → każde wejście do gry padało `NetworkError` (stary kod odbijał origin, checker 4d to zgubił). Fix: `platformOrigins()` w `cors-origins.ts` — WEB_URL + warianty localhost/127.0.0.1 na tym samym schemacie+porcie (+ test regresji). Wymaga rebuild gate. (2) `routes.test.ts` — nowe dziecko admin.route (AdminGamesView) bez mocka domykało cykl importów przez catalog.store→gate.store→router (mocki dodane). (3) test parytetu i18n porównywał LICZBĘ wystąpień `{n}` — pl ma 4 formy plural, en 2; zmienione na unikalne zbiory nazw parametrów. (4) **„Anuluj oczekiwanie" w kolejce nie zdejmowało overlayu:** gałąź `delete` w `subscriptions.ts` dopasowywała zdarzenie do filtra row-level po `fullDocumentBeforeChange`, a pre-images są w mongo domyślnie WYŁĄCZONE → delete wpisu `queue` (filtr `{userId:self}`) nigdy nie docierał do klienta (wpis znikał w bazie, overlay wisiał). Fix dwuwarstwowy: (a) fallback w gałęzi delete jak w update — bez pre-image emit `collection-delete` do wszystkich ticketów kolekcji („klient usuwa, jeśli miał"); (b) `init-db-data.js` włącza pre-images (`collMod changeStreamPreAndPostImages`) dla `queue` — przywraca precyzyjne filtrowanie (wymaga ponownego przebiegu `mongo-init` albo ręcznego collMod; sam fallback (a) wystarcza funkcjonalnie po rebuild gate). + 2 testy regresji w `subscriptions-manager.test.ts`. Dotyczyło też sprzątania wpisów `matched`/timeout propozycji (te same deleteMany).

**DŁUG/uwagi tej sesji:** okno wyścigu dwóch przeplecionych acceptów (podwójny mecz — akceptowalne przy 1 instancji games, atomowy claim = Etap 5); ranking/profil pokazują surowe `userId` (nicki wymagają denormalizacji w `ratings` albo batch-RPC — follow-up); cache originów CORS per-proces (publish gry → origin aktywny do 60 s); gość nie subskrybuje `ratings` (gdyby web miał pokazywać ranking gościom — rozszerzyć ścieżkę gościa); `games/app.ts` health raportuje `stage:'2c'` (kosmetyka); `annotations`/`match_events` nadal niepre-tworzone w `init-db-data.js` (ta sama klasa ryzyka co naprawione games/ratings/queue — dług 4b); trasa `/dev` celowo bez guarda (CTA enroll przed rolą); `/command/create-match` games-side nadal przyjmuje `ranked` w body (internal-only za sekretem, gate go nie wysyła — doszczelnienie games = follow-up).

**Weryfikacja Piotra (kolejność):**
1. `npm test --workspace gate` + `npm test --workspace web` + `npm test --workspace games` (nowe pliki testów wg raportów: gate `dev/queue/admin-games/games-abandon/cors-origins/games-client-4de/games-policy` + rozszerzony `s1-spy`; games `elo/matchmaker/command-api-catalog/command-api-queue`; web `game-app.helpers/GameRpsView.exit/CreateGameView/QuickMatchOverlay/AnnotationsBadges/locales-parity/useGameLaunch`).
2. `npm run test:integration --workspace games` (RS na 27140) — w tym nowy `ranked-queue.integration.test.ts`.
3. `npx vue-tsc --noEmit` w web + `npm run build --workspace games` (typy).
4. `docker compose up -d --build gate games web` + przebudowa one-shotów (`mongo-init`, `games-register` — nowy seed katalogu). Sanity: `db.games.findOne({_id:'rps'})` → published/rankedEligible.
5. Smoke: `/dev` (enroll→rejestracja→sekret RAZ→edycja→komunikat registered) → `/admin/games` approve → gra w katalogu; kolejka na 2 kontach → mecz ranked → ELO w `ratings` → profil + `/ranking/rps`; wyjście z gry (3 warianty); reveal: przegrany rundy 2-os. pokazuje „przegrana", nie „remis"; CORS: `curl -X POST .../auth/match-token -H 'Origin: https://obcy.example'` → brak ACAO.

## DECYZJE (sesja 2026-07-12, druga — przegląd planu z Piotrem)

**1. Gry zewnętrzne = WYŁĄCZNIE towarzyskie; ranked tylko wbudowane; bundle+CSP USUNIĘTE z planu (nie przesunięte).** Piotr: „akceptowalny jest fakt, że dev oszukuje, o ile my tego nie wykryjemy — wolę, żeby gra opierała się na zaufaniu, które można stracić". Analiza motywów (brak nagród → brak przemysłu cheatów; zostają status/cudza monetyzacja/trolling — amatorzy, których łapie statystyka) wsparta w ADR. Konsekwencje: Etap 6 chudnie (bez publish-ui/D2/CSP/S3), Etap 5 (judge+trust) = warunek wiarygodności obietnicy „wykrywamy i karzemy". Rozważany i ODRZUCONY na razie wariant przyszłej weryfikacji: jawny silnik gry uruchamiany na naszej infrze (koszty poza kontrolą). Pełny ADR: `ARCHITECTURE.md` „Gry zewnętrzne = tylko towarzyskie". **OTWARTE: arrowsoccer — casual jako zewnętrzna, czy wbudowana (first-party), żeby grać ranked? Rozstrzygnąć przed Etapem 6.**

**2. „Wykryte ryzyko oszustwa" = zgłoszenia graczy jako sygnał targetingu judge'a** (nie publiczny trzeci parametr): report „coś było nie tak" po meczu, ważony anty-brigadingowo, nigdy dowód. Publicznie zostają tylko renoma+sprawdzalność (dowodowe). Dodane do sygnałów targetingu w ARCHITECTURE i IMPLEMENTATION_PLAN.

**3. Boty: primarnie ZAWODNICY** (nieodróżnialni od graczy, np. dołączają do pustego lobby — pomysł Piotra), wtórnie instrument audytowy (pułapki, testowanie zewnętrznych aplikacji). Bot od deva NIE jest warunkiem niczego — tylko zachęta (szybsza sprawdzalność).

Zaktualizowane pliki: `ARCHITECTURE.md` (filar 2 „Safe secret" przepisany, tabela przywilejów, targeting, ADR-y), `docs/IMPLEMENTATION_PLAN.md` (progi, S3 wycofany, Etap 4/6, judge, boty), `docs/ETAP4_PLAN.md` (decyzja bundle superseded + czystka wzmianek), `docs/HOW_IT_WORKS.md` (obietnica „wykrywamy i karzemy"). Zakres 4d (casual, domena deva) BEZ ZMIAN — model potwierdzony przez Piotra. 4e bez zmian.

## Do adresacji w nowej sesji (Etap 4)

- **Brak nawigacji „wstecz/wyjdź" z widoku gry `/game/rps`** — założyciel czekający w lobby („Czekam na graczy") ani gracz w planning/reveal nie ma przycisku powrotu na Home. `goBack` istnieje tylko w stanach error/cancelled/finished. Dołożyć trwały afordans „Wyjdź z gry" (host: powinien anulować/zamknąć pokój; gracz: wrócić do `return`/Home). Uwaga sekretowa: wyjście w trakcie planning liczy się jak porzucenie (walkower — reguła Etap 2/4e).
- (drobne) Etykiety odznak = surowe `badgeId` (docelowo z manifestu gry, Etap 5); i18n/mapa etykiet do rozważenia.

## Etap 4 — 4a+4b+4c (społeczność) NAPISANE (sesja 2026-07-12)

> Kontrakt integracyjny (źródło prawdy): `docs/ETAP4_ABC_CONTRACT.md`. Praca 5 agentami na rozłącznych obszarach + integrator, wzorzec Etapu 2/Fali 3. **Sandbox nie odpala testów/Dockera — czeka na weryfikację Piotra (type-check + `npm test` gate/web/games + integ games na RS:27140 + live).**

**Zakres zrobiony:** 4a presence+znajomi, 4b czat+profile+adnotacje(ODCZYT+widoczność), 4c konwersja gościa. 4d/4e NIE ruszane — a 4d ZREDEFINIOWANE po tej sesji (gry zewnętrzne casual zamiast bundle+CSP; patrz „Następne kroki" pkt 4 i `docs/ETAP4_PLAN.md`).

**Nowe kolekcje/polityki (gate `policies.ts`):** `presence` (pisze gate; `{userId,status,lastSeen,currentMatchId,visibleTo[],updatedAt}`; polityka `{visibleTo:user._id}` — widoczne tylko znajomym), `friendships` (gate; para znormalizowana `a<b`+`invitedBy`; polityka strony), `messages` (gate; reshape zalążka na `{scope,scopeId,authorId,authorNick,text,members[],ts}`; polityka `{members:user._id}`), `annotations` (pisze **games**, exposed; `{playerId,gameId,badgeId,sentiment,params,earnedAt}`; polityka gate `{$or:[{sentiment:'positive'},{playerId:user._id}]}` = **bramka Etapu 4**).

**Komendy socket (gate):** `friends:invite/accept/remove`, `presence:set-invisible`, `chat:send {scope,scopeId,text}` (serwerowy rate-limit+limit długości+członkostwo), `profile:get {userId}` (publiczny profil+historia), `guest:convert {username,email,password}` (tylko `socket.guest`; guestId z tokenu, NIE z payloadu; limit dzienny per IP). Wszystkie identyfikatory z tożsamości tokenu.

**games — nowe endpointy internal (`command-api.ts`):** `/command/annotate` (MINIMALNY zapis — walidacja z manifestu odłożona do Etapu 5), `/command/player-history` (agregat win/loss/draw z `score`, argmax; czysta funkcja stanu), `/command/guest-matches` (okno), `/command/attach-guest` (przenosi guestId→players dla meczów z 7 dni, idempotentne, zero ELO). Indeksy `{players:1}`,`{guestIds:1}` na `matches`.

**web:** stores `social` (friends+presence) i `chat`; moduł `modules/social/` (FriendsAsidePanel w slocie `aside` Home, ChatAsidePanel, PlayerProfileView `/u/:userId`, AnnotationsBadges, GuestConvertView `/guest/convert`); i18n ns `social`+`community` (pl/en, parytet `typeof pl`); tryb niewidzialny w `/preferences` (SocialPrivacyToggle); CTA konwersji gościa po `finished` w `GameRpsView`. Token gościa: `hydra_guest_token` (spójny z RoomJoinView).

**Presence: pole `users.privacy.invisible`** (schemat + `session`/`login-complete` niosą `privacy`). Tryb niewidzialny degraduje status→`online` i zeruje `currentMatchId` przy zapisie (sekret nie trafia do dokumentu). Multi-device: licznik żywych socketów w `presence.service` (Map, per-proces — dług: multi-instancja gate wymaga wspólnego store).

**Hak lobby/match ZROBIONY (sesja 2026-07-12).** `presence.service` ma warstwę „activity" (Map per user, przeżywa reconnect): `setActivity('lobby'|'match', matchId)` / `clearActivity`. Wpięcia: `rooms:create`/`rooms:join` → `lobby`; socket tokenu meczu connect (app.class, `authSocket.match`, playerId≠`g_…`) → `match`; `rooms:leave`/`rooms:close` oraz disconnect socketu meczu → `clearActivity` (powrót do `online`). Pełny offline zapomina activity. `presence?` wstrzykiwane w `RoomsHandlerDeps` (opcjonalne — testy rdzenia pomijają). Testy activity w `presence.service.test.ts`. **Uproszczenie:** rozróżnienie lobby↔match jest sygnałowe (rooms vs ekran gry), NIE po `match.phase` — twórca czekający w lobby pokaże się jako `match` gdy wejdzie na ekran gry. Dokładność po fazie = dług.

**Czat DM 1:1 ZROBIONY (sesja 2026-07-12, po feedbacku live).** Klik w znajomego w `FriendsAsidePanel` otwiera rozmowę bezpośrednią (przełącza panel na `ChatAsidePanel` z przyciskiem wstecz). Nowy `scope='dm'` w `messages` (enum rozszerzony); kanał = posortowana para userId (`a_b`, helper `dmChannel` w `chat.model.ts` — identyczny po obu stronach). Gate `chat:send` dla `dm`: nadawca musi być w parze ORAZ być zaakceptowanym znajomym (`areFriends`, model friendships); tylko `socket.user` (gość nie DM-uje). `members=[a,b]` → polityka `messages` przepuszcza obu. Testy dm w `chat.test.ts`.

**Czat w meczu ZROBIONY (sesja 2026-07-12).** `ChatAsidePanel` osadzony w `GameRpsView` jako zwijany overlay (`.game-app__chat`, przycisk w rogu + drawer) — bez refaktoru logiki gry. Tylko dla ZALOGOWANEGO gracza (`gate.isAuthenticated` + `meId ∈ match.players`); gość czatu nie dostaje (MVP — brak socketu gate). `scope='match'`, `scopeId=match._id`. Style w `community.scss`. **Ikony dodane do `font-awesome.config.ts`** (`faComments/faPaperPlane/faUserPlus/faAward` — były używane przez czat/odznaki/znajomych, ale niezarejestrowane → nie renderowały się).

**DODANE W LIVE-TEŚCIE (2026-07-12, po 4a-4c):**
- **Zaproszenia po nazwie + resolver:** `friends:invite` rozwiązuje nazwę/`_id`→kanoniczny `_id`; denorm `friendships.nicks`.
- **Czat DM 1:1** z listy znajomych (klik w znajomego), `scope='dm'`, kanał = para userId, wymóg znajomości.
- **Linki do profilu** (`/u/:userId`) z listy znajomych/zaproszeń/DM + pozycja menu profilu „Historia i odznaki" (własny profil) — bo widok profilu istniał, ale nic nie linkowało.
- **Bug 4c naprawiony:** `/rooms/join-guest` nie dopisywał gościa do `guestIds` meczu → „not a member of this match". Dodano `joinMatch(...,'guest')` (mecz powstaje przy tworzeniu — Etap 3B).
- **Nick w grze:** denorm `matches.nicks {id→nick}` (przez create/join: username usera, nick gościa) → `playerLabel(pid, meId, nicks)`. Stare mecze mają puste `nicks` (fallback skrócone id).
- **Link zaproszenia gościa w lobby:** denorm `matches.roomCode` → w `/game/rps` przy niepełnym rosterze widoczny kopiowalny link `/r/CODE` (host i dołączeni). Odporne na odświeżenie.
- Fallback spóźnionego ruchu (potwierdzone): `catalog/rps` `defaultMove` = własna pref albo `hashMove(seed,playerId,round)` — NIE kopia przeciwnika.

**BUGI Z LIVE-TESTU (naprawione 2026-07-12):**
- **Zaproszenia po nazwie nie docierały:** `friends:invite` zapisywał wpisaną wartość dosłownie jako `_id`. Fix: `resolveUser` w gate (nazwa→`_id`, potem `_id` 24-hex); denormalizacja nazw (`friendships.nicks {id→username}`) → panel pokazuje nazwy, nie ObjectId.
- **Crash gate na `friends:accept` + presence zawsze „offline":** `getPresenceService()` był wołany przy ładowaniu `friends/index.ts`, a jego `require('../app')` łapał `App=undefined` (CYKLICZNY IMPORT — `app.ts` w trakcie ewaluacji) i zamrażał to w domknięciu → `getModel` rzucał `Cannot read ... 'models'` na KAŻDEJ operacji presence. onConnect/onDisconnect leciały w błąd od startu (łykane przez `.catch`), więc presence NIGDY nie działał; `accept` await-ował błąd → `unhandledRejection` → `process.exit`. **Fix: `require('../app')` PRZENIESIONY do wnętrza `getModel` (rozwiązywane przy każdym wywołaniu, gdy App gotowe).**
- **Utwardzenie dispatchu (`app.class.ts`):** wywołanie handlera opakowane w try/catch + `.catch` na zwróconym Promise — błąd JEDNEGO handlera loguje się, ale NIE ubija procesu gate (koniec z `unhandledRejection → process.exit` od buga w handlerze). Wzorzec do utrzymania.

**DECYZJE/DŁUG do świadomości Piotra:**
- **Presence widoczne TYLKO znajomym (całość dok.), nie „bare status publiczny"** — plan wspominał publiczny status, ale mechanizm polityk nie robi field-level-conditional; MVP bardziej prywatny, pokrywa deliverable. Rozbudowa = dług.
- **Granulacja lobby/match sygnałowa, nie po `match.phase`** (patrz wyżej) — dokładność po fazie = dług.
- **Czat gościa w meczu** — MVP tylko dla zalogowanych (gość nie ma socketu gate). Czat gościa wymagałby wysyłki tokenem match (handler już przyjmuje `socket.match`) + użycia go w web chat.store — follow-up.
- **4c ograniczenie:** brak trwałego „cookie sesji gościa" (dług Etapu 1) — konwersja podpina mecze BIEŻĄCEGO zweryfikowanego `guestId` z 7 dni. „Ten sam cookie przez wiele sesji" = follow-up.
- **Rate-limit/limit dzienny per-proces** (Map), nie Redis — MVP jednoinstancyjny.

**Weryfikacja krzyżowa (agent-recenzent):** eventy web↔gate, kształty games↔client, parytet i18n, wiring — CZYSTE po naprawie 3 defektów (blocker: payload `guest:convert-complete` `{userData,attached}` wyłuskiwany w GuestConvertView; 2× typ `score/finishedAt`). Zaktualizowano test `subscribe.test.ts` (messages ma teraz politykę → default-deny testowany na `moves`/`match_states`).

## Etap 3 — sesja 2026-07-11 (UI + przepływ „gry" + N-graczy + prefs)

> Kontrakty tej sesji (źródła prawdy, przeczytaj przy kontynuacji): `docs/ETAP3_UI_CONTRACT.md`, `docs/ETAP3B_GAMES_CONTRACT.md`, `docs/ETAP3C_NPLAYERS_CONTRACT.md`. Pracowano falami, agentami na rozłącznych plikach.

**Model UX: „nie ma pokojów, są gry".** `rooms` zostaje jako warstwa DISCOVERY (publiczne otwarte gry), `matches` = sekret (token meczu). Mecz powstaje OD RAZU przy zakładaniu gry (twórca ląduje w `/game/rps` i czeka na przeciwnika — bez limitu, bot w przyszłości). Drugi gracz klika kafelek → od razu ekran gry (join dokłada go do meczu + re-init `/init` pełnym rosterem).

**Home (`/`) = kwadratowe kafelki 1/3/9.** Pierwszy = „Nowa gra" → ekran konfiguracji (`/new`, `CreateGameView`): gra (RPS), liczba graczy (2..N, soft-cap 8, bez twardego max), „do ilu punktów" (dom. **5**). Kolejne kafelki: moje gry (status z meczu) + publiczne otwarte („Dołącz"). Kafelek mojej gry pokazuje realny status z `useGamesStore().matchById`: „Czeka na graczy (x/N)" / „W toku" / „Zepsuta"; **zakończone/anulowane auto-znikają**; przycisk **„X"** (host) → `rooms:close` (zamyka pokój + anuluje niezakończony mecz → znika dla wszystkich).

**Menu:** górne = tylko Home + Images/Admin (guardowane uprawnieniami). Profil/Wyloguj/**Preferencje** w dropdownie profilu (`AppMenu`/`AppVerticalMenu`). Usunięte na stałe: `controls`, `typography`, stary `/play`, lista `/rooms`, `RoomDetail` jako osobny ekran (join → prosto do gry).

**Ekran gry `/game/rps` (N graczy):** lobby z listą graczy + gotowość (`lobbyReady`); reveal = siatka rąk WSZYSTKICH + wynik rundy przy każdym (`roundPoints`: +/−/0); tablica wyników N (lider = max `scores`); finished: zwycięzca = max score, remis na szczycie → „Remis".

**Start gry (pkt 5 + 3B):** Planning rusza dopiero gdy WSZYSCY z rosteru klikną „Rozpocznij" ORAZ roster PEŁNY (`capacity`). Po 1. „Rozpocznij" ustawia się `deadline = now + planningPhaseMs`; scheduler AUTO-startuje po jego minięciu (pozostali dostają `defaultMove`). Lobby bez gotowości czeka bez limitu (brak auto-cancel).

**RPS dla N graczy (`catalog/rps`):** punktacja PAROWA — każda para: **TYLKO zwycięzca dostaje +1** (przegrany 0, remis 0); punkt rundy gracza = liczba wygranych par; wynik meczu = suma rund (**nieujemny, monotonicznie rosnący**). Koniec gdy ktoś osiągnie `target` (dom. 5). **UWAGA (zmiana 2026-07-12, po feedbacku Piotra): porzucono punktację o sumie zerowej (wygrany +1 / przegrany −1) na rzecz winner-only — przegrany dostaje 0, nie −1. Powód: −1 karał przegranego, a intencją jest tylko nagradzać zwycięzców. Przykład 3-osobowy: P1 bije P2, P3 bije P1, P2 bije P3 → każdy po 1 pkt.** `defaultMove` = preferencja gracza `fallbackMove` (`rock/paper/scissors/random`, dev-default `random`, deterministyczny z seed+pid+round). Event `match_events` niesie `points` (roundPoints) + `winner` (=roundWinner). **Dług UI (do decyzji): `GameRpsView.outcomeFor` koloruje wynik rundy po znaku punktów (`pts<0→lose`) — przy winner-only przegrany 2-os. rundy ma 0 pkt i pokazuje się jako „remis"; do zmiany na etykietę z `roundWinner` (unikalny lider = win, remis na szczycie = draw, reszta = lose).**

**Preferencje (menu profilu → `/preferences`):** motyw light/dark (trwałość localStorage `hydra-theme` już była), język pl/en (`usePrefsStore().language`, localStorage `hydra-language`, default `pl` — **UWAGA: to tylko ZAPIS wyboru; realne tłumaczenie = Fala 3 i18n, NIEZROBIONA**), ustawienia per gra (RPS fallback). Backend prefs: games command `/get-prefs`,`/set-prefs`; gate `games:get-prefs`/`games:set-prefs` (playerId z JWT).

**Nowe/ważne pola:** `matches.capacity` (dom. 2), `matches.lobbyReady` (map pid→bool). `RpsRoundView.roundPoints`. `rooms:create` payload przyjmuje `capacity?`/`target?`; nowy `rooms:close {roomId}`.

**Bugi produkcyjne wykryte w integracji i NAPRAWIONE tej sesji:** (a) `engine.createMatch` generuje `_id`, gdy brak `matchId` (schemat `_id` to String bez defaultu); (b) `command-api` — leniwy `require('./models')` → `await import('./models')` (nie działał w runtime ESM/vitest → 500 w create-match/prefs); (c) `engine.playerReady` — brama capacity: twórca nie startuje meczu w pojedynkę (był miękki deadlock). **Upload obrazków (admin/images):** web nie dostawał `VITE_IMAGE_URL` → strzelał w domyślny `:5179`; serwis image jest na hoście na **5279**. Dodano `VITE_IMAGE_URL` w `web/Dockerfile` (ARG) i `docker-compose` (build-arg `http://${HOST_IP}:5279/api`). Firewall: dla telefonu odblokuj też 5279.

**Rebuild po tej sesji:** dotknięte `gate`, `games`, `rps`, `web` (image bez zmian kodu). Bezpiecznie: `docker compose up -d --build gate games rps web`.

**Testy (stan na koniec sesji):** jednostkowe zielone (`npm test` — gate/web/games/catalog-rps/sdk/hmac/image; poprawione stale testy: role-based-visibility, subscriptions-manager). Integracyjne: `npm run test:integration` (root, dodany) = **games + image** (`--if-present`; web NIE ma test:integration). Wymaga: mongo RS na **27140** (games, transakcje) + mongo na **27133** (image; z `docker compose`). `games` przeszło po ostatnim fixie (dodanie `winner` do eventu RPS) — POTWIERDŹ ostatnim przebiegiem. `rps-volume.bench` za `BENCH=1`.

**Dług/uwagi Etapu 3:** legacy `games.store` (2c) wciąż init w `AppLayout` (nieszkodliwe, używane przez status Home); martwe klasy w `games.scss`; `rooms:start` to teraz martwy handler (mecz powstaje przy `rooms:create`); pełny N-graczy przetestowany tylko jednostkowo/integracyjnie — warto na żywo 3+ graczy.

**NAPRAWIONE (sesja 2026-07-12, po type-check): bug nawigacji klienckiej w slocie `default`.** Objaw: po kliknięciu (np. admin→Home albo Home→„Nowa gra") główny content nie renderował się — pusto do F5; nagłówek (slot `intro`) był widoczny, sam widok (slot `default`) nie. Diagnoza **potwierdzona na żywo** (DevTools na działającym webie): wrapper `.ui-general-transition` zostawał `--active` z zamrożoną `height` starego widoku i BEZ zamontowanego dziecka — czyli tryb `out-in` kończył fazę leave, ale nigdy nie odpalał enter nowego widoku. Po F5 działało, bo `from===START_LOCATION` → ścieżka `appearing` (bez fazy leave). Root cause: slot `default` używał `FadeAnimation` z `mode: out-in`, podczas gdy `fade.scss` ma `position:absolute` na OBU stanach (enter-active i leave-active) — CSS napisany pod nakładający się cross-fade, czyli tryb **symultaniczny** (tak jak działający slot `intro`). **Fix: `FadeAnimation.mode` → `ETransitionMode.default`** (`web/src/controls/animations.consts.ts`, komentarz z uzasadnieniem w pliku). Testy nie asertują `.mode` fade (tylko tożsamość obiektu) — zielone zostają. **Wymaga rebuild web** (`docker compose up -d --build web`) — łączy się z i tak oczekującym rebuildem pod smoke i18n Fali 3.

## Fala 3 — i18n (sesja 2026-07-12)

> Kontrakt: `docs/ETAP3_I18N_CONTRACT.md`. Wykonane 4 agentami na rozłącznych obszarach (A: auth/profile/settings/layout/controls, B: admin/images, C: game-app/games/composables, D: home/rooms/preferences/stores) + centralny setup.

- **vue-i18n v11**, `legacy:false`, `globalInjection:true` (w template `$t()` bez importów). Setup: `web/src/i18n/index.ts` (+ custom **reguła pluralizacji pl, 4 formy**: `zero | 1 | 2–4 | 5+`), `web/src/config/i18n.config.ts` (app.use + `watch(prefsStore.language, immediate)` → locale), `web/vitest.setup.ts` (i18n w `config.global.plugins`, locale `pl` — asercje testów na widoczne teksty są PO POLSKU).
- **Słowniki:** `web/src/i18n/locales/{pl,en}/<ns>.ts`, ns: `common auth profile settings layout admin images home rooms games preferences` (~260 kluczy). **Parytet kluczy wymusza TYP**: `en/<ns>.ts` deklaruje `const ns: typeof pl = {...}` — brak/nadmiar klucza = błąd `vue-tsc`.
- W .ts poza komponentami: `import { t } from '@/i18n'` (stores, composables, consts). Determinizm RPS zachowany: w `rps.consts.ts` stałe trzymają TYLKO klucze (`labelKey`), `t()` wołane per render, nic tłumaczonego nie idzie do stanu/socketów. Analogicznie `game-prefs.catalog.ts` trzyma klucze (kształt zgodny z przyszłym manifestem).
- Znane niuanse: nazwa gry „Gra {author}" zapisuje się na serwerze w języku twórcy; duplikaty wspólnych kluczy (create/yesDelete/…) między ns — kandydaci do konsolidacji w `common` (właściciel: jeden przelot, nie ruszać przy okazji).
- **Stan weryfikacji (koniec sesji 2026-07-12):** `npm install` zrobiony, **`npm test -w web` ZIELONE**. vue-tsc: 2×TS2322 w routes NAPRAWIONE (sekcja niżej) — **czeka na potwierdzenie `npm run type-check -w web` przez Piotra**. Pozostały krok po potwierdzeniu: rebuild `docker compose up -d --build web` + smoke przełącznika języka w `/preferences` (ma przełączać CAŁĄ apkę na żywo).

### NAPRAWIONE (2026-07-12, sesja 2): vue-tsc — 2×TS2322 w `router/routes/index.ts` (adminRoute, imagesRoute)

Historia: pierwszy pełny `vue-tsc --build` po `npm install` wyrzucił 5 błędów — **tylko 1 z fali i18n** (PreferencesView: implicit any — NAPRAWIONY), 4 zastane. Naprawione wcześniej: cast `FontAwesomeIcon as Component` (TS2590), `UiButton.type` zawężony do `'button'|'submit'|'reset'`, `routes: RouteRecordRaw[]` w `routes/index.ts`, **oraz realny ukryty bug: `images.store` nie zwracał `lastSelectedId`, a `ImagesView.openImage` pisał w nieistniejącą właściwość (no-op kotwicy shift-selecta) — ref wyeksponowany**.

Ostatnie 2 (adminRoute/imagesRoute): **root cause potwierdzony minimalnym repro w sandboksie** (czysty `tsc` na typach vue-router 4.6.4, bez .vue): `satisfies RouteRecordRaw` PRZECHODZI w pliku route (sprawdzanie kontekstowe, każde dziecko osobno vs unia), ale **typ eksportu pozostaje wywnioskowanym literałem** — dzieci z/bez `aside` sklejają się w unię z `aside?: undefined`, i przy PONOWNYM sprawdzeniu w `routes/index.ts` (już bez kontekstu) `undefined` nie przechodzi jako komponent → unia dyskryminuje do `RouteRecordRedirect` i żąda `redirect`. Dlatego błąd wskazywał `index.ts`, nie pliki route — **to NIE był cache ani wersje** (repro identyczne na TS 5.6.3 i 6.0.3). **Fix: jawna adnotacja `const adminRoute: RouteRecordRaw = {...}; export default adminRoute` zamiast `satisfies`** (analogicznie images) — repro zielone na obu wersjach TS. Zaaplikowane w `admin.route.ts` + `images.route.ts` (komentarz z uzasadnieniem w admin.route.ts).

**Przy okazji wykryty dryf wersji (nie był przyczyną, ale warto wiedzieć):** `web` deklaruje `typescript ~5.6.3` (i ma lokalnie 5.6.3 w `web/node_modules`), ale pozostałe workspaces mają `^6.0.2` → w rootowych `node_modules` zhoistowany **typescript 6.0.3** oraz **vue-tsc 2.2.12** (deklarowane `^2.1.10`). vue-tsc leży w root, więc `require('typescript')` rozwiązuje mu się do **6.0.3**, nie 5.6.3 — type-check weba realnie chodzi na TS 6. Dziś bez skutków; kandydat do ujednolicenia (podbić weba do `^6.0.2` albo przypiąć vue-tsc lokalnie w web).

Monorepo `platform` (workspaces): `gate/` (brama/tożsamość/subskrypcje), `games/` (silnik meczów, kolekcje prywatne), `web/` (Vue3), `catalog/rps/` (RPS jako pierwsza gra first-party), `packages/{hmac,sdk}` (wspólny HMAC + SDK twórcy gry), `image/` (media). Zbudowane z fundamentu hydra.

**Szczegóły per etap: `ETAP0.md`, `ETAP1.md`, `ETAP2.md`** (ten ostatni = pełny handoff Etapu 2 z listą plików, testów, decyzji i DŁUGU). Kontrakt 2d: `docs/ETAP2D_CONTRACT.md`.

### Jak uruchomić lokalnie (cały stack)

1. `.env` w roocie (patrz `.env.example`): `JWT_SECRET`, `INTERNAL_SECRET`, `RPS_HMAC_SECRET`, `HOST_IP` (adres LAN maszyny do gry z telefonu — puste = tylko localhost), `GATE_TLS=false` (dev/LAN bez certów).
2. `docker compose up --build`. Usługi: mongo ×3 (RS `h2dbs`) + `mongo-init` (inicjalizuje RS, tworzy kolekcje), `gate` (4214→4114), `web` (5273), `games` (4220→4120), `rps` (serwis logiki), `games-register` (one-shot: rejestruje RPS), `image`.
3. Otwórz `http://<HOST_IP lub localhost>:5273`. **Dev domyślnie po zwykłym HTTP/WS** (`GATE_TLS=false`) — bez akceptowania certów. Test gate: `http://<host>:4214/health` → `{"status":"ok"}`.
4. **Telefon / inny sprzęt w LAN:** ustaw `HOST_IP` na IP maszyny (Windows `ipconfig` → IPv4 WiFi), przebuduj web (adres jest wkompilowany: `docker compose up -d --build web`), na telefonie `http://<HOST_IP>:5273`. Częsty blocker: Firewall Windows na portach 5273/4214 (zezwól inbound) i izolacja klientów na routerze. **Zweryfikowane działa** (Brave/Android).
5. **Prod:** `GATE_TLS=true` + certy (albo TLS na reverse-proxy, gate za nim po HTTP), `HOST_IP` może być domeną (docelowo lepiej rozbić na `WEB_ORIGIN`/`GATE_ORIGIN` + porty 443). Gate obsługuje oba tryby (`gate/app/app.class.ts`: http/https wg `GATE_TLS`; CORS odbija origin — w prod ograniczyć).
6. **gate i games dzielą tę samą bazę `hydra`** (gate subskrybuje przez change-stream na SWOJEJ bazie — matches/match_views MUSZĄ tam być; kolekcje prywatne games chroni warstwa polityk, nie osobna baza).
7. Testy: `npm test --workspace {gate,web}` (bez bazy); integracyjne games wymagają osobnego 1-węzłowego RS na 27140 (patrz `ETAP2.md` „Jak uruchomić testy"). **Sandbox Claude NIE odpala testów ani Dockera** (Windows node_modules, zablokowany npm) — odpala Piotr.

### Zdrowie kodu / na co uważać

- **Bramkę Etapu 2 dopięliśmy dopiero w live-teście** — wyszła seria realnych bugów (naprawionych, ale WARTE TESTÓW REGRESJI, patrz `ETAP2.md` „Dług"): identyczność string vs `ObjectId` (`socket.user._id`), `matches._id` jako string, propagacja update'ów bez pre-images change-streamu, initial-load kolekcji bez modelu gate, CORS na REST bramki, wspólna baza gate/games, `rooms:start` nie startuje rundy (robi to gracz w aplikacji gry przyciskiem „Rozpocznij"), jeden aktywny pokój na hosta, brakujące skrypty init RS (`db/scripts/rs-init-docker.sh`, `init-db-data.js`).
- **`planningPhaseMs` idzie z MANIFESTU gry** (catalog/rps) → `/init` zwraca manifest → `create-match` przenosi do `match.options` → silnik używa. To wzorzec „atrybut gry ustawia twórca", nie env.

## Co to jest

**sixseven** — platforma gier turowych z symultanicznym planowaniem (wszyscy planują w tajemnicy ~30 s → wspólny reveal). Gry tworzą zewnętrzni deweloperzy i hostują w całości u siebie (logika = bezstanowe HTTP wołane przez platformę; UI = osobna aplikacja z handoffem tokenowym). **Naczelna idea, na której zależy Piotrowi: „walutą platformy jest sekret"** — platforma jest powiernikiem zaplanowanych ruchów (nie pozna ich ani przeciwnik, ani twórca gry) i handluje mierzalnym zaufaniem (renoma × sprawdzalność).

## Mapa dokumentów (kolejność czytania dla nowej sesji)

1. `README.md` — mapa + elementy systemu.
2. `ARCHITECTURE.md` — architektura, WSZYSTKIE decyzje jako ADR-y (w tym odrzucone z uzasadnieniem — nie otwieraj ich ponownie bez nowych argumentów; szczególnie: wabiki/rotacja ID odrzucone).
3. `docs/IMPLEMENTATION_PLAN.md` — cykl życia sekretu (kręgosłup), logika biznesowa z liczbami, etapy 0–6 z kryteriami akceptacji, testy sekretu S1–S5.
4. `docs/GAME_DEV_GUIDE.md` — spec SDK/DX (RPS jako pełny przykład), `docs/services/*.md` — rola+plan per serwis, `docs/UNKNOWNS.md` — czego nie wiemy, `docs/HOW_IT_WORKS.md` — wersja dla ludzi, `docs/games/ARROWSOCCER.md` — flagowiec.

## Fundament kodu: hydra

Podmontowany drugi folder: `C:\Users\piotr\projects\hydra` — istniejący projekt Piotra (Node/Express/socket.io/Mongoose + Vue3/Pinia + Mongo replica set ×3 z change streams). To baza pod sixseven. Najważniejsze fakty z audytu (pełny audyt wpleciony w ARCHITECTURE i docs/services/*):

- Rodowód: rewrite „coordinator-server" do sterowania Unreal Engine w studiu TV — cała domena engines/clusters/projects/concepts jest DO WYCIĘCIA.
- Klejnot: `gate/app/subscriptions/subscriptions.ts` — prawdziwe change streams z filtrami in-process. **Luka #1: autoryzacja subskrypcji tylko per kolekcja, zero row-level** — naprawa to etap 1.
- Auth JWT z rewokacją + RBAC z dziedziczeniem ról: dojrzałe, bierzemy.
- Web: system slotów layoutu (9 named RouterView z animacjami per slot), dark/light na CSS vars, ~20 kontrolek `Ui*` — bierzemy w całości. Bugi: motyw nie zapisuje się do localStorage; dedupe ticketów subskrypcji gubi multi-device.
- `JWT_SECRET` hardcoded w docker-compose (rotacja w etapie 0); `cfg/` zastąpić zwykłym `.env`; katalog `new/` martwy.

## Kluczowe decyzje (esencja — szczegóły w ADR-ach)

1. **Mongo RS + change streams** (nie Postgres) — fan-out stanu przez subskrypcje.
2. **Mikroserwisy:** gate (brama/tożsamość/subskrypcje), games (skarbiec: silnik meczów, matchmaking, trust), judge (sędzia prawdy: audyty), web (Vue3), photos (media), + SDK jako produkt.
3. **Logika gry = zdalny serwis deva** (bezstanowe HTTP, podpisy HMAC, budżet 2 s, 1 zbatchowany `/resolve` per runda). Sandbox ODRZUCONY — nie wykonujemy cudzego kodu.
4. **UI gry = aplikacja deva z handoffem** (kod jednorazowy → token scoped do meczu). Self-hosted = zawsze casual z etykietą „UI poza platformą"; **ranked tylko gry wbudowane** *(zmiana 2026-07-12 sesja 2: poziom „bundle+CSP" wycofany — patrz DECYZJE wyżej)*.
5. **Safe secret, 3 warstwy** *(warstwa 2 przepisana 2026-07-12 sesja 2)*: ruchy opuszczają platformę dopiero po zamknięciu fazy (brak zdalnego validate-move w planowaniu!); ranked wyłącznie wbudowane (zamiast bundle+CSP); detekcja (statystyka kontr, mecze-pułapki, zgłoszenia graczy). Parowania sesji NIE da się zapobiec — bronimy kanałów, nie tożsamości meczu.
6. **Zaufanie = renoma (start 100, spada za naruszenia, odbudowa asymptotyczna do 95) × sprawdzalność (start 0, rośnie z obserwacjami, naruszenia TEŻ ją podnoszą)**. Kupuje przywileje (progi w planie). Konto deva dziedziczy; nowa gra startuje z renomą konta.
7. **judge:** targeting (heurystyki/admin/AI w trybach off/assist/auto) twardo oddzielony od werdyktów (tylko deterministyczne dowody: replay-audit, test lustrzany, pułapki). „AI wybiera cele, nigdy nie ferruje wyroków."
8. Kontrakt gry: `init(playerIds, seed, playerData{data,prefs}, options)` / `resolve` (z revealDurationMs) / `viewFor` / `defaultMove(rng)` / `annotate(grant/revoke odznak z manifestu)`. Opcje meczu z manifestu (presety+pola), pamięć per (gracz,gra): `data` pisze annotate, `prefs` pisze UI gry. `planningPhaseMs ≥ 2000` — platforma świadomie NIE jest real-time.
9. Goście: casual przez link, konwersja do konta; ELO per gra tylko domyślny preset; walkower: porzucający pełne K, wygrany połowa K.
10. Gry na start: RPS (tutorial easy), pojedynek snajperów (krótkie tury 3–5 s, test dołu zakresu), **arrowsoccer** (flagowiec).

## arrowsoccer — kontekst osobisty Piotra

Turowa piłka nożna (1v1, po 4 zawodników, strzałki=impulsy, fizyka konfigurowalna, reveal jako animacja — UI odtwarza tę samą deterministyczną symulację; three.js, siatka bramki jako cloth przy golu — Piotrowi na tym zależy). **Piotr napisał tę grę kiedyś we Flashu+PHP i zna ślepe zaułki** — spisany jest jeden (symulacja kwantowa: stały kwant czasu, kolizje w kwancie, niezmiennik „nic nie opuszcza boiska"). **Wątek otwarty: wyciągnąć od niego pozostałe miny z tamtej implementacji.** Formacje w przestrzeni kanonicznej (obrót 0/180°), boisko renderowane od strony gracza (mobile portrait).

## Jak pracować z Piotrem (obserwacje z sesji)

- Po polsku. Zwięźle — bez lania wody, preferencje globalne: maksymalna konkretność i prawdomówność („truthful at all cost") — gdy jego pomysł ma wadę, rozłóż go uczciwie na czynniki (tak było z wabikami — docenił analizę i odrzucenie z ADR-em).
- Decyzje przez AskUserQuestion z rekomendacją; wyjaśniaj żargon po ludzku, gdy poprosi (raz poprosił o rozpisanie skrótów — CSP, ADR itd.).
- Myśli produktowo i rzuca pomysły w locie — rolą sesji jest je uczciwie stress-testować i NATYCHMIAST wpisywać wnioski do dokumentów (ADR-y także dla odrzuconych pomysłów).
- Wzorzec sesji: dyskusja → decyzja → aktualizacja dokumentów → present_files → krótkie podsumowanie z 1–2 rzeczami wartymi uwagi + propozycja następnego kroku.

## Następne kroki (w kolejności)

1. **Domknięcie Fali 3 (i18n):** testy web ZIELONE; fix vue-tsc ZAAPLIKOWANY (sekcja „NAPRAWIONE" wyżej) — **Piotr: `npm run type-check -w web`**, potem rebuild web + smoke przełącznika języka.
2. ~~Weryfikacja na żywo Etapu 3~~ — ZROBIONA 2026-07-12 (zielono: przepływ N-graczy, kafelki, „X", obrazki, `test:integration`).
3. **Możliwe następne (pomysły Piotra):** bot dołączający do gry, gdy brak przeciwnika (wspomniane jako przyszłość); presence/kolejka szybkiego meczu (oryginalny Etap 3 z `IMPLEMENTATION_PLAN.md`, częściowo zastąpiony modelem „lista otwartych gier na Home").
4. **Dalej wg planu:** **Etap 4** — rozpisany na podetapy w `docs/ETAP4_PLAN.md`. **UWAGA: 4d ZREDEFINIOWANE (sesja 2026-07-12, dyskusja z Piotrem)** — wyszło nieporozumienie: plan zakładał „RPS przechodzi na bundle", a model Piotra to **gry wbudowane** (RPS na stałe częścią aplikacji platformy) vs **gry zewnętrzne** (wszyscy devi, flagowo arrowsoccer.com). Nowy zakres 4d: konta deweloperów + rejestracja gry (ręczny approve) + katalog data-driven + przekierowanie na UI deva z handoffem cross-origin (CORS per zarejestrowany origin) — casual only. Hosting bundli+CSP+S3 PRZESUNIĘTY do Etapu 6 (arrowsoccer = pierwszy konsument); ADR „Gry wbudowane vs zewnętrzne" w `ARCHITECTURE.md`. **4e NIE zależy już od 4d** — ranked (ELO+walkowery+kolejka) gra na wbudowanym RPS; może iść zaraz po 4a–4c, równolegle z 4d. **Etap 5** judge + trust + pipeline walidacji rejestracji. **Etap 6** arrowsoccer + hosting bundli + tutorial. Otwarte wątki dok.: snajperzy (przed etapem 5); ślepe zaułki arrowsoccera; `docs/UNKNOWNS.md`.

## Jak pracowaliśmy w sesjach implementacyjnych (Etap 2)

- **Praca równoległa agentami** sprawdziła się: rozłączne obszary (gate / web / testy games) spięte jednym kontraktem-plikiem (`docs/ETAP2D_CONTRACT.md`), potem integracja i weryfikacja krzyżowa. Kluczowe: rozłączne pliki, precyzyjny kontrakt z góry.
- **Skille** `front`/`back`/`test`/`data` uruchamiane przy odpowiednich zadaniach; skille formatów (docx/pptx/xlsx) niepotrzebne tu.
- **Środowisko:** sandbox nie odpala testów ani Dockera (Windows node_modules + zablokowany npm). Weryfikacja: czytanie kodu, `tsc --noEmit` na czystych plikach przez configi w `/tmp` (mapujące pakiety źródło-only na źródła — bo `packages/*` nie mają `dist/`). **Uwaga: mount bash bywa niezsynchronizowany z narzędziami plikowymi** — pokazuje urwane/stare wersje i fałszywe błędy `tsc` w liniach niezwiązanych z edycją; weryfikuj przez `Read`, ufaj buildowi Dockera. **KRYTYCZNE (nauczka 2026-07-12): NIGDY nie pisz/edytuj plików projektu przez bash (`printf >>`, `sed -i` itd.) — trafia w niezsynchronizowaną kopię i USZKADZA plik (raz urwało `games.scss` → sass „expected }"; naprawa `git checkout` z sandboxa NIEMOŻLIWA: „Operation not permitted"). Pliki edytuj WYŁĄCZNIE narzędziami Read/Write/Edit. Jak sandbox nie może cofnąć uszkodzenia — `git checkout -- <plik>` odpala Piotr lokalnie.**
- **Pakiety źródło-only** (`sixseven-hmac`, `sixseven-sdk`) budowane do `dist/` w obrazach games/rps (kontekst roota); ich `tsconfig` dostały `types:["node"]` (inaczej `tsc` nie widzi `crypto`/`Buffer`).
