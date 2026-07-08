# HANDOFF — kontekst sesji dla kontynuacji

> Cel pliku: pełny reset sesji nie może kosztować kontekstu. Nowa sesja: przeczytaj ten plik, potem `README.md` (mapa dokumentacji). Cała wiedza projektowa jest w dokumentach — ten plik mówi, jak z nich korzystać i co jest między wierszami.

## Stan projektu (2026-07-08)

**Faza: planowanie ZAKOŃCZONE, kod NIE istnieje.** Folder `platform` zawiera wyłącznie dokumentację (13 plików .md). Następny krok: **etap 0** z `docs/IMPLEMENTATION_PLAN.md` (porządki w kodzie hydry — wycinka domeny studia, rotacja sekretów, fix bugów).

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

1. **Etap 0** (`docs/IMPLEMENTATION_PLAN.md` + plany per serwis w `docs/services/`): monorepo z hydry, wycinka domeny studia, rotacja sekretów, fix motywu i multi-device, reseed ról.
2. Równolegle/potem: etap 1 — polityki row-level w gate (test S1).
3. Otwarte wątki dokumentacyjne: dokument projektowy snajperów (przed etapem 5); pozostałe ślepe zaułki arrowsoccera od Piotra; szczegółowy spec wire contract (przy implementacji SDK, etap 2).
4. Rzeczy „nie wiem" z terminami: `docs/UNKNOWNS.md` — utrzymywać zgodnie z zasadami w tym pliku.
