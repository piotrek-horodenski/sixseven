# Etap 4 — plan podetapów: stawka i społeczność

> Etap 4 z `IMPLEMENTATION_PLAN.md`: ELO + walkowery, hosting zaufanych bundli UI (CSP + subdomena per gra), RPS na bundle, znajomi, czat lobby/meczu, adnotacje + profile, konwersja gościa w konto. Tniemy go na podetapy z **własnymi** testami, żeby każdy zamykał się osobno.
>
> **Kręgosłup tej edycji: społeczność najpierw** (decyzja Piotra, sesja 2026-07-12). Podetapy społecznościowe (4a–4c) idą przed nurtem „stawki" (4d–4e), do którego przenosimy też **odsunięte kawałki oryginalnego Etapu 3** (kolejka szybkiego meczu, presence) — patrz `HANDOFF.md` „Następne kroki".
>
> Bazuje na: `IMPLEMENTATION_PLAN.md` (kolekcje + polityki: `presence`, `friendships`, `messages`, `ratings`, `queue`, `annotations`; tokeny; testy S1/S3), `ARCHITECTURE.md` (ADR „Safe secret" 3-warstwowy, ranked = UI na platformie z CSP, adnotacje, wielosesyjność) i `docs/IMPLEMENTATION_RISKS.md` (**D1** kanały nawigacyjne CSP, **D2** osobna domena rejestrowalna, **B4** wolumen streamów, **E1** agregaty jako czysta funkcja zdarzeń).

## Zasada porządkująca (jak w całym projekcie)

Dla każdego podetapu najpierw pytamy: **co robi z sekretem?** Społeczność (4a–4c) sekretu nie dotyka — to warstwa nad platformą; jej ryzyko jest prywatnościowe (kto widzi czyj status/wiadomości/adnotacje), nie sekretowe. Stawka (4d–4e) dotyka sekretu wprost: ranked wymaga, by UI gry **nie mogło** wynieść zaplanowanego ruchu z przeglądarki gracza — to filar 2 modelu „Safe secret" (CSP), i to jest najtrudniejszy, najbardziej ryzykowny kawałek całego etapu.

## Mapa podetapów

> **Status (sesja 2026-07-12): 4a+4b+4c NAPISANE** (5 agentów + integracja + weryfikacja krzyżowa; kontrakt `docs/ETAP4_ABC_CONTRACT.md`). Czeka na weryfikację Piotra (type-check + testy + live). 4d/4e nietknięte. Dług/decyzje: patrz `HANDOFF.md` sekcja „Etap 4".

| Podetap | Cel jednym zdaniem | Zależy od | Bramka | Status |
|---|---|---|---|---|
| **4a** | Presence + znajomi: kto jest online, zaproszenia/akceptacje, lista znajomych na żywo | Etap 3 | Dwóch graczy widzi wzajemny status live; zaproszenie→akceptacja→znajomy | ✍️ napisane (status online/offline; lobby/match hak do wpięcia) |
| **4b** | Czat (lobby/mecz) + profile + adnotacje na profilu | 4a | Czat w lobby i meczu działa; profil pokazuje ELO/historię/odznaki; **adnotacja negative niewidoczna dla innych** | ✍️ napisane (adnotacje ODCZYT+widoczność=bramka OK; czat bez punktu montażu w meczu — decyzja) |
| **4c** | Konwersja gościa w konto (podpięcie meczów z 7 dni) | 4a (model kont/sesji) | Gość zakłada konto, jego mecze towarzyskie z ostatnich 7 dni lądują na koncie | ✍️ napisane (MVP: bieżący guestId z 7 dni; multi-sesja=follow-up) |
| **4d** | Zaufany hosting bundli UI + CSP + osobna domena + RPS na bundle | Etap 3 (równolegle do 4a–4c) | **S3 na produkcyjnym hostingu bundli** (bundle nie wykona żądania poza platformę, w tym kanały nawigacyjne) | ⬜ nietknięte |
| **4e** | Ranked: ELO + walkowery + kolejka szybkiego meczu (+ hak na bota) | 4d | Walkower liczy ELO wg reguł; szybki mecz dobiera i gra na bundlu; ranking per gra live | ⬜ nietknięte |

**Kolejność i równoległość.** Twarda zależność jest jedna: **4e (ranked) wymaga bundle'a z 4d** (ranked = UI na platformie z CSP — ADR „Safe secret"). Reszta jest luźniejsza: 4d to głównie backend+hosting (rozłączne pliki od gate/web społeczności), więc **4d może iść równolegle do 4a–4c** dwoma frontami agentów, spięte kontraktem — dokładnie wzorzec z Etapu 2/Fali 3. 4b zależy od 4a (znajomi/presence pod czat i profile), 4c od modelu kont z Etapu 1.

Testy sekretu wchodzą do CI w podetapie, w którym powstaje testowany mechanizm: **S3 (pełna, z kanałami nawigacyjnymi) w 4d**; rozszerzenie **S1** o `friendships`/`messages`/`presence` w 4a–4b.

---

## 4a — Presence + znajomi

**Cel.** Fundament społeczności: platforma wie, kto jest online i w jakim stanie (lobby/mecz), a gracze budują graf znajomości. W hydrze presence nie istnieje — do zbudowania; gate zna cykl życia socketów, więc to naturalny właściciel.

**Deliverables.**
- Kolekcja `presence` (pisze gate): `userId`, `status` (online/lobby/match), `lastSeen`, `currentMatchId`. Źródłem prawdy jest cykl życia socketu (connect/disconnect + eventy wejścia do lobby/meczu). Multi-device: status = agregat sesji z `users.sessions[]` (Etap 1) — rozłączenie JEDNEGO urządzenia nie zbija na offline, dopóki żyje inna sesja.
- Kolekcja `friendships` (pisze gate): `a`, `b`, `status` (invited/accepted). Komendy: `friends:invite`, `friends:accept`, `friends:remove`. Polityka odczytu: **uczestnicy** (nie da się podejrzeć cudzych relacji).
- Polityka odczytu `presence`: sam status publiczny, szczegóły (`currentMatchId`) tylko dla znajomych — filtr wstrzykiwany z rejestru polityk (Etap 1).
- Web: lista znajomych w slocie `aside`/menu (subskrypcja `friendships` + `presence`), wskaźnik online/lobby/mecz na żywo, przepływ zaproszenia (wyślij / przyjmij / odrzuć). i18n (Fala 3) — nowe klucze do `common`/nowego ns `social`.

**Testy do CI.**
- Rozszerzenie **S1**: konto-szpieg nie widzi `friendships`, których nie jest stroną, ani `currentMatchId` osoby spoza listy znajomych.
- Presence multi-device: dwie sesje jednego usera, zamknięcie jednej ≠ offline; zamknięcie ostatniej → offline po grace period.
- `friends:accept` idempotentny; nie da się zaakceptować cudzego zaproszenia (playerId z JWT, nie z payloadu).

**Akceptacja.** Dwóch graczy dodaje się wzajemnie i widzi swój status (online→lobby→mecz) na żywo; polityki `presence`/`friendships` przechodzą S1.

---

## 4b — Czat (lobby/mecz) + profile + adnotacje

**Cel.** Domknąć warstwę społeczną wokół meczu: rozmowa w lobby i w trakcie meczu, profil gracza z realnymi danymi (ELO wejdzie w 4e — tu miejsce i historia), oraz **poprawna widoczność adnotacji** przyznawanych przez gry.

**Deliverables.**
- Kolekcja `messages` (ożywić zalążek z hydry; pisze gate): `roomId`/`matchId`, `authorId`, `text`, `ts`. Polityka: **członkowie pokoju/meczu**. Rate-limit + limit długości (anti-spam). Czat w slocie `aside` (lobby) i w ekranie meczu.
- **Uwaga sekretowa dla czatu w meczu:** wiadomości są jawne między uczestnikami od razu (to NIE ruch) — ale kanał czatu nie może stać się bocznym kanałem wycieku planu; w meczach rankingowych (4d/4e, UI = bundle z CSP) czat renderuje **platforma**, nie bundle gry, żeby aplikacja gry nie miała dostępu do treści rozmów (ADR „Safe secret" pkt 1 w `ARCHITECTURE.md`: pełny JWT w aplikacji gry = dev widzi czat/znajomych — dlatego scoped token + czat po stronie platformy).
- Profile: strona gracza (publiczny profil z sanityzacją), miejsce na ranking per gra (dane z 4e), historia meczów z `match_events`, sekcja odznak/tytułów.
- Adnotacje na profilu: `annotations` (`playerId`, `gameId`, `badgeId`, `sentiment`, `earnedAt`) — **polityka: `sentiment=='positive'` publiczne LUB `playerId==user`**. Wyświetlanie: pozytywne widoczne dla wszystkich; neutralne/negatywne tylko dla właściciela. (Przyznawanie przez `/annotate` z puli manifestu — mechanika wejdzie pełniej z trust/judge w Etapie 5; tu domykamy ODCZYT i widoczność.)

**Testy do CI.**
- **Bramka etapu (kryterium akceptacji Etapu 4): adnotacja `negative`/`neutral` niewidoczna dla innego gracza** — konto-szpieg czyta `annotations` i nie dostaje cudzych niepublicznych.
- Rozszerzenie **S1** o `messages`: nie-członek pokoju/meczu nie widzi wiadomości.
- Czat: rate-limit i limit długości egzekwowane po stronie serwera (nie tylko UI).

**Akceptacja.** Czat działa w lobby i meczu; profil renderuje historię i odznaki; niepubliczne adnotacje niewidoczne dla obcych (S1).

---

## 4c — Konwersja gościa w konto

**Cel.** Zamknąć pętlę pozyskania: gość grający przez link (Etap 2d) może założyć konto i **nie stracić** dotychczasowych meczów towarzyskich.

**Deliverables.**
- Ekran po meczu gościa „załóż konto, żeby zachować wynik" (był zaplanowany w Etapie 2 jako logika biznesowa gościa — tu realizacja UI + backend).
- Konwersja: rejestracja z podpięciem meczów gościa z **ostatnich 7 dni** (klucz: cookie sesji gościa z Etapu 1). Mecze towarzyskie przechodzą na nowe konto; **zero ELO/rankingu** (goście nie generują ratingu — anti-farming, waga 0 do sprawdzalności).
- Limit N meczów dziennie per cookie/IP (przeciw spamowi) — parametr w konfigu.

**Testy do CI.**
- Konwersja podpina wyłącznie mecze z okna 7 dni tego samego cookie; nie da się „przejąć" cudzych meczów podając obce cookie w payloadzie.
- Mecze gościa po konwersji nie tworzą wpisów ELO/rankingu.

**Akceptacja.** Gość gra mecz przez link → zakłada konto → jego mecze z 7 dni są na koncie; ranking pozostaje nietknięty.

---

## 4d — Zaufany hosting bundli UI + CSP + osobna domena + RPS na bundle

**Cel.** Najtrudniejszy i najbardziej ryzykowny podetap: filar 2 „Safe secret". UI gry rankingowej ma być **statycznym bundlem hostowanym u nas**, z CSP tak szczelnym, że przeglądarka gracza fizycznie nie pozwala wynieść zaplanowanego ruchu. RPS przechodzi na tę ścieżkę i zostaje wzorcem OBU dróg (redirect-app z Etapu 2d = casual; bundle = ranked).

**Deliverables.**
- **Decyzja D2 (podjąć ZANIM powstanie pierwszy bundle):** bundle serwowane z **osobnej domeny rejestrowalnej** (wzorzec `googleusercontent.com`), np. `sixsevenusercontent.com`, subdomena per gra tam. Cookies platformy **host-only** (nigdy `Domain=.sixseven.gg`), żeby kod gry nie czytał sesji gracza. Zmiana originów po fakcie łamie tokeny i CSP wszystkich gier — dlatego teraz. → **ADR w `ARCHITECTURE.md`.**
- `publish-ui`: upload bundla przez konto dewelopera, walidacja, wersjonowanie, serwowanie z subdomeny per gra.
- **CSP (wytyczna D1):** pełna polityka od `default-src 'none'` z jawnymi zezwoleniami; `connect-src` = wyłącznie API platformy; `form-action 'none'`; blokada rejestracji service workerów; **blokada WebRTC**; rozważyć osadzenie bundla w **sandboxowanym iframe**. Handoff tokenu meczu do bundla (scoped token z Etapu 2d), czat/znajomi renderowane przez platformę (nie bundle).
- RPS jako zaufany bundle (ta sama `GameDefinition`/logika zdalna; zmienia się tylko warstwa UI i hosting).
- **Rezydualne ryzyko kanałów nawigacyjnych** (`location=`, `<a ping>`, prefetch, `window.open`) — nie da się zamknąć w 100% bez zabicia UX; **zapisać wprost w ADR**, warstwa 3 (detekcja statystyczna, Etap 5 judge) pozostaje siatką.

**Testy do CI.**
- **S3 (pełna wersja):** zaufany bundle z wstrzykniętą próbą eksfiltracji — blokowaną przez CSP w PRAWDZIWEJ przeglądarce (e2e). Pokrywa kanały danych (fetch, WS, WebRTC, beacon-obrazek) **oraz nawigacyjne** (`location=`, `form-action`, `<a ping>`, prefetch, `window.open`, rejestracja SW) — rozszerzenie względem podstawowego S3 z Etapu 2d (D1).
- Cookies platformy nie są czytelne z originu bundla (host-only) — test integracyjny.
- Token meczu w bundlu nie otwiera nic poza swoim meczem (regresja z 2d na nowym originie).

**Akceptacja.** RPS grywalny jako bundle na osobnej domenie; S3 zielone dla wszystkich zadresowanych kanałów; sesja gracza nieosiągalna dla kodu gry.

---

## 4e — Ranked: ELO + walkowery + kolejka szybkiego meczu

**Cel.** Stawka: rating per gra, walkowery, i **odsunięta z Etapu 3 kolejka szybkiego meczu**. Ranked biegnie wyłącznie na bundlu z 4d (warunek „Safe secret").

**Deliverables.**
- Kolekcja `ratings` (`userId`, `gameId`, `elo`, `matches`, `K`) — publiczna. ELO per gra, **tylko domyślny preset**: start 1200; K=32 przez pierwsze 30 meczów, potem 16, od 2400: 10. Aktualizacja po `Finished` z `winnerIds` (remis 0,5). Mecze z gośćmi, niedomyślnym presetem, anulowane i towarzyskie **nie dotykają ELO**.
- **Walkower (ranked):** porzucający → przegrana z pełnym K; pozostały → wygrana z **połową K** (farming mało opłacalny). Rozłączony przez 2 kolejne rundy w rankingowym → walkower (reguła z maszyny stanów, Etap 2).
- Kolejka szybkiego meczu (`queue`: `gameId`, `userId`, `elo`, `since`; polityka: tylko własne wpisy). Dobór: `|ΔELO| ≤ 100`, okno +50 co 10 s, max 400; po dopasowaniu 10 s na „accept", brak = powrót na koniec kolejki. **Na start można FIFO+accept**, ELO-dobór właściwy gdy `ratings` żyje.
- Ranking per gra publiczny (kolekcja `ratings`), pozycja gracza na profilu (miejsce z 4b domknięte).
- **Hak na bota do pułapek** (Etap 5 judge): interfejs/miejsce, gdzie bot dołącza, gdy brak przeciwnika — spójne z pomysłem Piotra „bot dołączający do gry". Tu tylko scaffold/kontrakt, pełne pułapki w Etapie 5.

**Testy do CI.**
- Walkower liczy ELO wg reguł (porzucający pełne K, wygrany połowa K); mecz towarzyski/anulowany nie zmienia ELO.
- Kolejka: dobór w oknie ΔELO, rozszerzanie okna w czasie, timeout „accept" wraca na koniec; wpis `queue` widoczny tylko właścicielowi.
- ELO jako czysta funkcja wyników (odtwarzalne przeliczenie z historii `match_events` — spójne z zasadą E1 dla trust w Etapie 5).

**Akceptacja.** Szybki mecz dobiera dwóch graczy i gra na bundlu (4d); walkower nalicza ELO wg reguł; ranking per gra live na profilu i w katalogu.

---

## Decyzje (ADR-skróty — pełne do dopisania w `ARCHITECTURE.md`)

### Osobna domena rejestrowalna dla bundli (D2)
**Why:** „Subdomena per gra" pod domeną platformy dzieli scope cookies — jedna literówka w `Domain` = sesje graczy w rękach kodu gry.
**What:** bundle na osobnej domenie rejestrowalnej (`sixsevenusercontent.com`), subdomena per gra tam; cookies platformy host-only. Decyzja PRZED pierwszym bundlem (4d) — po fakcie łamie tokeny i CSP wszystkich gier.
**Watch out:** origin zaszyty w tokenach/CSP; migracja później = kosztowna.

### Czat renderuje platforma, nie bundle gry
**Why:** aplikacja gry z dostępem do treści czatu = boczny kanał i wektor phishingu; scoped token meczu celowo nie daje dostępu do `messages`/`friendships`.
**What:** czat lobby/meczu żyje w powłoce platformy (poza bundlem); bundle dostaje tylko token meczu do `submit-move`/`reveal-done`/`prefs`.
**Watch out:** spójność UX (czat „obok" bundla, nie „w"); do rozwiązania w warstwie layoutu.

### Ranked wyłącznie na bundlu z CSP
**Why:** filar 2 „Safe secret" — UI zna rysowany ruch z natury; tylko CSP zamyka kanał wycieku po stronie przeglądarki.
**What:** 4e (ranked/ELO/kolejka) twardo zależy od 4d; casual pozostaje na redirect-app z etykietą „UI poza platformą".
**Watch out:** kanały nawigacyjne (D1) rezydualne — detekcja (Etap 5) to siatka bezpieczeństwa, nie gwarancja.

## Uwagi przekrojowe

- **Liczby to konfiguracja** (K, okna matchmakingu, TTL, limity gościa, retencja) — parametry od dnia 1, kalibracja po playtestach (dane telemetryczne z 2c, `UNKNOWNS.md`).
- **Wolumen streamów (B4):** presence + friends + czat to nowe, gadatliwe subskrypcje — wpiąć `$match` po kolekcji i indeks `kolekcja → tickets` (zaplanowane w 2e) zanim społeczność wejdzie na żywo; obserwować CPU dopasowywania streamów.
- **Co świadomie NIE wchodzi w Etap 4:** `trust_events`/renoma/sprawdzalność/`judge`/pułapki z botami (Etap 5 — tu tylko hak na bota i ODCZYT adnotacji), rejestracja self-service z pipeline (Etap 5), snajperzy i arrowsoccer (Etap 5/6). Ranked w Etapie 4 działa bez progów zaufania — bramkowanie ranked renomą/sprawdzalnością dochodzi w Etapie 5.
- **Wzorzec pracy (sprawdzony w Etapie 2/Fali 3):** rozłączne obszary agentami spięte jednym kontraktem-plikiem, potem integracja i weryfikacja krzyżowa; skille `back`/`front`/`data`/`test` per zadanie; weryfikacja live po stronie Piotra (sandbox nie odpala Dockera/testów).

## Otwarte pytania

- **Sandbox iframe dla bundla** (D1): czy od razu osadzać bundle w sandboxowanym iframe, czy najpierw sama subdomena + CSP i iframe jako hardening później? Wpływa na handoff tokenu i layout czatu.
- **Kształt handoffu tokenu do bundla na osobnej domenie** (postMessage vs URL-fragment): projektować z 4d, bo dotyka granicy originów i D2.
- **Presence a prywatność:** czy `currentMatchId` widoczny dla wszystkich znajomych, czy z opcją „tryb niewidzialny"? (prefs gracza, tanie do dołożenia w 4a).
- **ELO a niedomyślne presety:** plan trzyma ELO tylko dla domyślnego presetu — czy warianty (np. RPS do innej liczby punktów) dostają osobne, nierankingowe leaderboardy? (odłożone, ale zanotować).
