# HANDOFF — kontekst sesji dla kontynuacji

> Cel pliku: pełny reset sesji nie może kosztować kontekstu. Nowa sesja: przeczytaj ten plik, potem `README.md` (mapa dokumentacji). Cała wiedza projektowa jest w dokumentach — ten plik mówi, jak z nich korzystać i co jest między wierszami.

## Stan projektu (2026-07-12)

**Faza: kod ISTNIEJE. Etapy 0, 1, 2 zaimplementowane i przeszły na żywo. Etap 3 (UI/przepływ „gry", N-graczy) ZROBIONY i ZWERYFIKOWANY na żywo. Fala 3 (i18n pl/en) POTWIERDZONA przez Piotra. Etap 4 — podetapy 4a+4b+4c (społeczność: presence+znajomi, czat+profile+adnotacje-odczyt, konwersja gościa) NAPISANE tej sesji 5 agentami + integracja + weryfikacja krzyżowa; sandbox nie odpala testów/Dockera → czeka na weryfikację Piotra (sekcja „Etap 4" niżej). 4d/4e (bundle+CSP, ranked) NIE ruszane.**

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
4. **UI gry = aplikacja deva z handoffem** (kod jednorazowy → token scoped do meczu). Dwa poziomy: ranked wymaga bundle'a na platformie z CSP (connect-src tylko my); self-hosted = tylko casual z etykietą.
5. **Safe secret, 3 warstwy:** ruchy opuszczają platformę dopiero po zamknięciu fazy (brak zdalnego validate-move w planowaniu!); ranked-UI z CSP; detekcja (statystyka kontr, mecze-pułapki). Parowania sesji NIE da się zapobiec — bronimy kanałów, nie tożsamości meczu.
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
- **Środowisko:** sandbox nie odpala testów ani Dockera (Windows node_modules + zablokowany npm). Weryfikacja: czytanie kodu, `tsc --noEmit` na czystych plikach przez configi w `/tmp` (mapujące pakiety źródło-only na źródła — bo `packages/*` nie mają `dist/`). **Uwaga: mount bash bywa niezsynchronizowany z narzędziami plikowymi** — pokazuje urwane/stare wersje i fałszywe błędy `tsc` w liniach niezwiązanych z edycją; weryfikuj przez `Read`, ufaj buildowi Dockera.
- **Pakiety źródło-only** (`sixseven-hmac`, `sixseven-sdk`) budowane do `dist/` w obrazach games/rps (kontekst roota); ich `tsconfig` dostały `types:["node"]` (inaczej `tsc` nie widzi `crypto`/`Buffer`).
