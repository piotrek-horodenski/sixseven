# HANDOFF — kontekst sesji dla kontynuacji

> Cel pliku: pełny reset sesji nie może kosztować kontekstu. Nowa sesja: przeczytaj ten plik, potem `README.md` (mapa dokumentacji). Cała wiedza projektowa jest w dokumentach — ten plik mówi, jak z nich korzystać i co jest między wierszami.

## Stan projektu (2026-07-11)

**Faza: kod ISTNIEJE. Etapy 0, 1, 2 zaimplementowane. Bramka Etapu 2 PRZESZŁA NA ŻYWO** — dwóch graczy (Piotr + córka) rozegrało pełny mecz RPS z telefonu przez pokój/link, z handoffem do aplikacji gry, wynikiem do 2 zwycięstw i rewanżem. Następny: **Etap 3 (matchmaking)**.

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

1. **Domknąć Etap 2 formalnie:** przejść na żywo scenariusze awaryjne bramki (serwis RPS off w rundzie → Paused → powrót → dograne; restart games → dograne — testy są w `games/tests/integration/`, warto też kliknąć na żywo), oraz gość grający towarzysko przez link. Potem **testy regresji** na bugi z live-testu (sekcja „Dług" w `ETAP2.md`).
2. **Etap 3 — Znajdowanie współgraczy** (`docs/IMPLEMENTATION_PLAN.md`): kolejka szybkiego meczu (FIFO + accept, bez ELO), katalog gier, presence, opcje meczu w lobby (generyczny renderer ze schematu manifestu — tu wchodzi też pełne wpięcie `planningPhaseMs`/opcji per gra), toast manager, kwoty równoległych meczów. Bramka: katalog → szybki mecz → gra → wynik → rewanż.
   - Uwaga UX z sesji: wejście do gry ma być bez wpisywania cudzego `_id`. Model „otwarty slot + pierwszy dołączający = przeciwnik" JEST już zrobiony jako pokoje (2d). „Lista otwartych meczów na /play" (create open match → join) to naturalny kawałek Etapu 3, gdyby Piotr chciał drugą ścieżkę obok pokoi.
3. **Etap 4:** ranked + ELO, zaufany hosting bundli UI (CSP, blokada WebRTC — dopiero tu S3 ma pełny sens), znajomi, czat. **Etap 5:** judge + trust. **Etap 6:** arrowsoccer + tutorial.
4. Otwarte wątki dokumentacyjne (bez zmian): dokument projektowy snajperów (przed etapem 5); pozostałe ślepe zaułki arrowsoccera od Piotra; `docs/UNKNOWNS.md` utrzymywać.

## Jak pracowaliśmy w sesjach implementacyjnych (Etap 2)

- **Praca równoległa agentami** sprawdziła się: rozłączne obszary (gate / web / testy games) spięte jednym kontraktem-plikiem (`docs/ETAP2D_CONTRACT.md`), potem integracja i weryfikacja krzyżowa. Kluczowe: rozłączne pliki, precyzyjny kontrakt z góry.
- **Skille** `front`/`back`/`test`/`data` uruchamiane przy odpowiednich zadaniach; skille formatów (docx/pptx/xlsx) niepotrzebne tu.
- **Środowisko:** sandbox nie odpala testów ani Dockera (Windows node_modules + zablokowany npm). Weryfikacja: czytanie kodu, `tsc --noEmit` na czystych plikach przez configi w `/tmp` (mapujące pakiety źródło-only na źródła — bo `packages/*` nie mają `dist/`). **Uwaga: mount bash bywa niezsynchronizowany z narzędziami plikowymi** — pokazuje urwane/stare wersje i fałszywe błędy `tsc` w liniach niezwiązanych z edycją; weryfikuj przez `Read`, ufaj buildowi Dockera.
- **Pakiety źródło-only** (`sixseven-hmac`, `sixseven-sdk`) budowane do `dist/` w obrazach games/rps (kontekst roota); ich `tsconfig` dostały `types:["node"]` (inaczej `tsc` nie widzi `crypto`/`Buffer`).
