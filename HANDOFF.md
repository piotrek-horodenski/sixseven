# HANDOFF — kontekst sesji dla kontynuacji

> Cel pliku: pełny reset sesji nie może kosztować kontekstu. Nowa sesja: przeczytaj ten plik, potem `README.md` (mapa dokumentacji). Cała wiedza projektowa jest w dokumentach — ten plik mówi, jak z nich korzystać i co jest między wierszami.

## Stan projektu (2026-07-11)

**Faza: kod ISTNIEJE. Etapy 0, 1, 2 zaimplementowane i przeszły na żywo. Etap 3 (UI/przepływ „gry", N-graczy) ZROBIONY i ZWERYFIKOWANY na żywo (2026-07-12: przepływ N-graczy, kafelki, „X", upload obrazków, `test:integration` zielone). Fala 3 (i18n pl/en) NAPISANA w sesji 2026-07-12; testy web zielone, blocker vue-tsc naprawiony (sesja 2) — czeka na potwierdzenie type-check + rebuild + smoke po stronie Piotra (sekcja „Fala 3" niżej).**

## Etap 3 — sesja 2026-07-11 (UI + przepływ „gry" + N-graczy + prefs)

> Kontrakty tej sesji (źródła prawdy, przeczytaj przy kontynuacji): `docs/ETAP3_UI_CONTRACT.md`, `docs/ETAP3B_GAMES_CONTRACT.md`, `docs/ETAP3C_NPLAYERS_CONTRACT.md`. Pracowano falami, agentami na rozłącznych plikach.

**Model UX: „nie ma pokojów, są gry".** `rooms` zostaje jako warstwa DISCOVERY (publiczne otwarte gry), `matches` = sekret (token meczu). Mecz powstaje OD RAZU przy zakładaniu gry (twórca ląduje w `/game/rps` i czeka na przeciwnika — bez limitu, bot w przyszłości). Drugi gracz klika kafelek → od razu ekran gry (join dokłada go do meczu + re-init `/init` pełnym rosterem).

**Home (`/`) = kwadratowe kafelki 1/3/9.** Pierwszy = „Nowa gra" → ekran konfiguracji (`/new`, `CreateGameView`): gra (RPS), liczba graczy (2..N, soft-cap 8, bez twardego max), „do ilu punktów" (dom. **5**). Kolejne kafelki: moje gry (status z meczu) + publiczne otwarte („Dołącz"). Kafelek mojej gry pokazuje realny status z `useGamesStore().matchById`: „Czeka na graczy (x/N)" / „W toku" / „Zepsuta"; **zakończone/anulowane auto-znikają**; przycisk **„X"** (host) → `rooms:close` (zamyka pokój + anuluje niezakończony mecz → znika dla wszystkich).

**Menu:** górne = tylko Home + Images/Admin (guardowane uprawnieniami). Profil/Wyloguj/**Preferencje** w dropdownie profilu (`AppMenu`/`AppVerticalMenu`). Usunięte na stałe: `controls`, `typography`, stary `/play`, lista `/rooms`, `RoomDetail` jako osobny ekran (join → prosto do gry).

**Ekran gry `/game/rps` (N graczy):** lobby z listą graczy + gotowość (`lobbyReady`); reveal = siatka rąk WSZYSTKICH + wynik rundy przy każdym (`roundPoints`: +/−/0); tablica wyników N (lider = max `scores`); finished: zwycięzca = max score, remis na szczycie → „Remis".

**Start gry (pkt 5 + 3B):** Planning rusza dopiero gdy WSZYSCY z rosteru klikną „Rozpocznij" ORAZ roster PEŁNY (`capacity`). Po 1. „Rozpocznij" ustawia się `deadline = now + planningPhaseMs`; scheduler AUTO-startuje po jego minięciu (pozostali dostają `defaultMove`). Lobby bez gotowości czeka bez limitu (brak auto-cancel).

**RPS dla N graczy (`catalog/rps`):** punktacja PAROWA — każda para: wygrany +1, przegrany −1, remis 0; punkt rundy gracza = suma po przeciwnikach; wynik meczu = suma rund (może być ujemny). Koniec gdy ktoś osiągnie `target` (dom. 5). **UWAGA: zmiana dla 2 graczy — przegrany ma teraz −1 (było 0).** `defaultMove` = preferencja gracza `fallbackMove` (`rock/paper/scissors/random`, dev-default `random`, deterministyczny z seed+pid+round). Event `match_events` niesie `points` (roundPoints) + `winner` (=roundWinner).

**Preferencje (menu profilu → `/preferences`):** motyw light/dark (trwałość localStorage `hydra-theme` już była), język pl/en (`usePrefsStore().language`, localStorage `hydra-language`, default `pl` — **UWAGA: to tylko ZAPIS wyboru; realne tłumaczenie = Fala 3 i18n, NIEZROBIONA**), ustawienia per gra (RPS fallback). Backend prefs: games command `/get-prefs`,`/set-prefs`; gate `games:get-prefs`/`games:set-prefs` (playerId z JWT).

**Nowe/ważne pola:** `matches.capacity` (dom. 2), `matches.lobbyReady` (map pid→bool). `RpsRoundView.roundPoints`. `rooms:create` payload przyjmuje `capacity?`/`target?`; nowy `rooms:close {roomId}`.

**Bugi produkcyjne wykryte w integracji i NAPRAWIONE tej sesji:** (a) `engine.createMatch` generuje `_id`, gdy brak `matchId` (schemat `_id` to String bez defaultu); (b) `command-api` — leniwy `require('./models')` → `await import('./models')` (nie działał w runtime ESM/vitest → 500 w create-match/prefs); (c) `engine.playerReady` — brama capacity: twórca nie startuje meczu w pojedynkę (był miękki deadlock). **Upload obrazków (admin/images):** web nie dostawał `VITE_IMAGE_URL` → strzelał w domyślny `:5179`; serwis image jest na hoście na **5279**. Dodano `VITE_IMAGE_URL` w `web/Dockerfile` (ARG) i `docker-compose` (build-arg `http://${HOST_IP}:5279/api`). Firewall: dla telefonu odblokuj też 5279.

**Rebuild po tej sesji:** dotknięte `gate`, `games`, `rps`, `web` (image bez zmian kodu). Bezpiecznie: `docker compose up -d --build gate games rps web`.

**Testy (stan na koniec sesji):** jednostkowe zielone (`npm test` — gate/web/games/catalog-rps/sdk/hmac/image; poprawione stale testy: role-based-visibility, subscriptions-manager). Integracyjne: `npm run test:integration` (root, dodany) = **games + image** (`--if-present`; web NIE ma test:integration). Wymaga: mongo RS na **27140** (games, transakcje) + mongo na **27133** (image; z `docker compose`). `games` przeszło po ostatnim fixie (dodanie `winner` do eventu RPS) — POTWIERDŹ ostatnim przebiegiem. `rps-volume.bench` za `BENCH=1`.

**Dług/uwagi Etapu 3:** legacy `games.store` (2c) wciąż init w `AppLayout` (nieszkodliwe, używane przez status Home); martwe klasy w `games.scss`; `rooms:start` to teraz martwy handler (mecz powstaje przy `rooms:create`); pełny N-graczy przetestowany tylko jednostkowo/integracyjnie — warto na żywo 3+ graczy.

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
4. **Dalej wg planu:** **Etap 4** ranked + ELO, hosting bundli UI (CSP/WebRTC), znajomi, czat. **Etap 5** judge + trust. **Etap 6** arrowsoccer + tutorial. Otwarte wątki dok.: snajperzy (przed etapem 5); ślepe zaułki arrowsoccera; `docs/UNKNOWNS.md`.

## Jak pracowaliśmy w sesjach implementacyjnych (Etap 2)

- **Praca równoległa agentami** sprawdziła się: rozłączne obszary (gate / web / testy games) spięte jednym kontraktem-plikiem (`docs/ETAP2D_CONTRACT.md`), potem integracja i weryfikacja krzyżowa. Kluczowe: rozłączne pliki, precyzyjny kontrakt z góry.
- **Skille** `front`/`back`/`test`/`data` uruchamiane przy odpowiednich zadaniach; skille formatów (docx/pptx/xlsx) niepotrzebne tu.
- **Środowisko:** sandbox nie odpala testów ani Dockera (Windows node_modules + zablokowany npm). Weryfikacja: czytanie kodu, `tsc --noEmit` na czystych plikach przez configi w `/tmp` (mapujące pakiety źródło-only na źródła — bo `packages/*` nie mają `dist/`). **Uwaga: mount bash bywa niezsynchronizowany z narzędziami plikowymi** — pokazuje urwane/stare wersje i fałszywe błędy `tsc` w liniach niezwiązanych z edycją; weryfikuj przez `Read`, ufaj buildowi Dockera.
- **Pakiety źródło-only** (`sixseven-hmac`, `sixseven-sdk`) budowane do `dist/` w obrazach games/rps (kontekst roota); ich `tsconfig` dostały `types:["node"]` (inaczej `tsc` nie widzi `crypto`/`Buffer`).
