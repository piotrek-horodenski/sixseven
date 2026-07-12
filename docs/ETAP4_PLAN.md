# Etap 4 — plan podetapów: stawka i społeczność

> Etap 4 z `IMPLEMENTATION_PLAN.md` (**po redefinicji 4d, sesja 2026-07-12** — patrz decyzja „Gry wbudowane vs zewnętrzne" niżej): ELO + walkowery, otwarcie na gry zewnętrzne (konta deweloperów, rejestracja, katalog, UI na domenie deva), znajomi, czat lobby/meczu, adnotacje + profile, konwersja gościa w konto. Tniemy go na podetapy z **własnymi** testami, żeby każdy zamykał się osobno.
>
> **Kręgosłup tej edycji: społeczność najpierw** (decyzja Piotra, sesja 2026-07-12). Podetapy społecznościowe (4a–4c) idą przed nurtem „stawki i otwarcia" (4d gry zewnętrzne, 4e ranked), do którego przenosimy też **odsunięte kawałki oryginalnego Etapu 3** (kolejka szybkiego meczu, presence) — patrz `HANDOFF.md` „Następne kroki".
>
> Bazuje na: `IMPLEMENTATION_PLAN.md` (kolekcje + polityki: `presence`, `friendships`, `messages`, `ratings`, `queue`, `annotations`; tokeny; testy S1/S3), `ARCHITECTURE.md` (ADR „Safe secret" 3-warstwowy, ranked = UI na platformie z CSP, adnotacje, wielosesyjność) i `docs/IMPLEMENTATION_RISKS.md` (**D1** kanały nawigacyjne CSP, **D2** osobna domena rejestrowalna, **B4** wolumen streamów, **E1** agregaty jako czysta funkcja zdarzeń).

## Zasada porządkująca (jak w całym projekcie)

Dla każdego podetapu najpierw pytamy: **co robi z sekretem?** Społeczność (4a–4c) sekretu nie dotyka — to warstwa nad platformą; jej ryzyko jest prywatnościowe (kto widzi czyj status/wiadomości/adnotacje), nie sekretowe. **4d (gry zewnętrzne)** dotyka sekretu na granicy originów: token meczu wydawany na obcą domenę nie może otwierać niczego poza jednym meczem. **4e (ranked)** biegnie na grach WBUDOWANYCH — UI jest częścią naszej aplikacji, deweloperem jesteśmy my, więc filar 2 „Safe secret" (bundle+CSP) nie ma tu przeciwnika, przed którym miałby bronić. Filar 2 staje się potrzebny dopiero, gdy ZEWNĘTRZNA gra zechce ranked — i ta budowa jest świadomie przesunięta poza Etap 4 (patrz decyzje).

## Mapa podetapów

> **Status (sesja 2026-07-12): 4a+4b+4c NAPISANE** (5 agentów + integracja + weryfikacja krzyżowa; kontrakt `docs/ETAP4_ABC_CONTRACT.md`). Czeka na weryfikację Piotra (type-check + testy + live). 4d/4e nietknięte. Dług/decyzje: patrz `HANDOFF.md` sekcja „Etap 4".

| Podetap | Cel jednym zdaniem | Zależy od | Bramka | Status |
|---|---|---|---|---|
| **4a** | Presence + znajomi: kto jest online, zaproszenia/akceptacje, lista znajomych na żywo | Etap 3 | Dwóch graczy widzi wzajemny status live; zaproszenie→akceptacja→znajomy | ✍️ napisane (online/lobby/match wpięte; granulacja lobby↔match sygnałowa, nie po fazie) |
| **4b** | Czat (lobby/mecz) + profile + adnotacje na profilu | 4a | Czat w lobby i meczu działa; profil pokazuje ELO/historię/odznaki; **adnotacja negative niewidoczna dla innych** | ✍️ napisane (adnotacje ODCZYT+widoczność=bramka OK; czat w meczu = overlay w GameRpsView dla zalogowanych) |
| **4c** | Konwersja gościa w konto (podpięcie meczów z 7 dni) | 4a (model kont/sesji) | Gość zakłada konto, jego mecze towarzyskie z ostatnich 7 dni lądują na koncie | ✍️ napisane (MVP: bieżący guestId z 7 dni; multi-sesja=follow-up) |
| **4d** | Gry zewnętrzne (casual): konta deweloperów, rejestracja gry, katalog z adresem UI deva, handoff na obcy origin | Etap 3 (równolegle do 4a–4c i 4e) | Deweloper (bez uprawnień admina) rejestruje grę; po approve gracz gra mecz towarzyski end-to-end na domenie deva i wraca z wynikiem; token meczu z obcego originu nie otwiera nic poza swoim meczem | ⬜ nietknięte |
| **4e** | Ranked (gry wbudowane): ELO + walkowery + kolejka szybkiego meczu (+ hak na bota) | Etap 3 (profil z 4b dostaje miejsce na ELO) | Walkower liczy ELO wg reguł; szybki mecz dobiera i rozgrywa wbudowany RPS; ranking per gra live | ⬜ nietknięte |

**Kolejność i równoległość.** Po redefinicji 4d twarda zależność 4e→4d ZNIKNĘŁA: ranked biegnie na wbudowanym RPS, więc **4e może startować od razu po 4a–4c**. 4d (gry zewnętrzne) jest niezależny od 4e i w dużej mierze rozłączny plikowo od społeczności — może iść równolegle, wzorzec z Etapu 2/Fali 3. 4b zależy od 4a (znajomi/presence pod czat i profile), 4c od modelu kont z Etapu 1.

Testy sekretu wchodzą do CI w podetapie, w którym powstaje testowany mechanizm: rozszerzenie **S1** o `friendships`/`messages`/`presence` w 4a–4b; w 4d regresja tokenów meczu na obcym originie. **S3 (CSP, kanały nawigacyjne) przesuwa się razem z hostingiem bundli poza Etap 4** — wejdzie do CI, gdy powstanie pierwszy zaufany bundle (arrowsoccer / pierwsza zewnętrzna gra ranked).

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

## 4d — Gry zewnętrzne: konta deweloperów, rejestracja, UI na domenie deva (casual)

> **Redefinicja (sesja 2026-07-12).** Poprzednie brzmienie 4d („RPS przechodzi na bundle + hosting bundli + CSP") wynikało z założenia, że KAŻDA gra — także RPS — przejdzie ścieżkę zewnętrzną. Piotr doprecyzował model: **RPS (i ewentualne kolejne first-party) są WBUDOWANE w aplikację platformy na stałe**, a otwarcie dotyczy wyłącznie gier deweloperów — zawsze zewnętrznych (flagowy przykład: arrowsoccer na własnej domenie). Hosting bundli+CSP przestał mieć konsumenta w Etapie 4 i został przesunięty (patrz decyzje niżej).

**Cel.** Zbudować wszystko, czego platforma potrzebuje, żeby deweloper mógł **skonfigurować i uruchomić swoją grę w naszej aplikacji**: konto dewelopera, rejestrację gry, wpis w katalogu i przepływ gracza na domenę deva i z powrotem. Logika zdalna już działa od Etapu 2 (RPS technicznie chodzi tą ścieżką — HTTP + HMAC); nowość to **UI na obcym originie** i samoobsługa rejestracji. Zakres świadomie CASUAL — ranked dla gier zewnętrznych wymaga bundla u nas i jest poza tym podetapem.

**Deliverables.**
- **Konto dewelopera:** rola `developer` (RBAC z Etapu 0/1), samodzielne założenie konta, widok „moje gry" w web.
- **Rejestracja gry przez deva:** manifest (jak `game.config.json` RPS: id, gracze, `planningPhaseMs ≥ 2000`, schemat opcji, pula odznak), URL serwisu logiki, **URL aplikacji UI** (nowe pole — dziś przekierowanie jest na sztywno do `/game/rps`), wygenerowany sekret HMAC. Stany minimalne: `registered → published` przez **ręczny approve admina** — automatyczny pipeline walidacji (zdalne kontrakt-testy) to Etap 5. Wpisy w kolekcji `games` (publiczna/subskrybowalna — katalog z niej żyje).
- **Katalog data-driven:** Home/`CreateGameView` przestaje być hardcodem „RPS" — lista gier z `games` (wbudowane + opublikowane zewnętrzne), z **etykietą „UI poza platformą"** przy zewnętrznych.
- **Przepływ gracza na obcy origin:** „graj" → `games:request-handoff` → przekierowanie na `uiUrl` gry z kodem handoff (`?handoff=CODE&return=…`); wymiana kodu na token meczu (`POST /auth/match-token`) działa z obcego originu — **CORS zawężony do zarejestrowanych `uiUrl`** (nie `*`); powrót na platformę po meczu (ekran wyniku z `match_events` istnieje od Etapu 2/3).
- **Higiena granicy originów:** cookies platformy host-only (nigdy z atrybutem `Domain=`); token meczu jako JEDYNY materiał uwierzytelniający po stronie gry; zasada „gra nigdy nie prosi o hasło platformy" (granica phishingu z ADR o UI) — do regulaminu i komunikatu przy pierwszym przejściu na zewnętrzną grę.

**Testy do CI.**
- Regresja tokenów na obcym originie: kod handoff jednorazowy; token meczu nie otwiera nic poza swoim meczem (rozszerzenie testów z 2d o scenariusz cross-origin).
- CORS: wymiana kodu handoff z originu NIEzarejestrowanego = odrzucona.
- Rejestracja: dev nie może edytować cudzej gry; gra przed approve niewidoczna w katalogu; manifest z `planningPhaseMs < 2000` odrzucony.
- Katalog: gra zewnętrzna ma etykietę „UI poza platformą" (decyduje zewnętrzność UI, nie właściciel).

**Akceptacja.** Deweloper (konto bez uprawnień admina) rejestruje grę z logiką i UI na własnym originie; admin zatwierdza; gracz znajduje ją w katalogu, gra mecz towarzyski end-to-end na domenie deva i wraca na platformę z wynikiem.

**Czego tu świadomie NIE ma:** hostingu bundli UI + CSP + osobnej domeny (D2) + testu S3 — przesunięte do etapu pierwszej zewnętrznej gry rankingowej (naturalny kandydat: arrowsoccer, Etap 6); automatycznego pipeline'u walidacji (Etap 5); trust/renomy (Etap 5).

---

## 4e — Ranked (gry wbudowane): ELO + walkowery + kolejka szybkiego meczu

**Cel.** Stawka: rating per gra, walkowery, i **odsunięta z Etapu 3 kolejka szybkiego meczu**. Ranked biegnie na grach WBUDOWANYCH (RPS): UI jest częścią naszej aplikacji, deweloperem jesteśmy my — filar 2 „Safe secret" (bundle+CSP) nie ma tu zastosowania. Gry zewnętrzne pozostają casual do czasu hostingu bundli.

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

**Akceptacja.** Szybki mecz dobiera dwóch graczy i rozgrywa wbudowany RPS; walkower nalicza ELO wg reguł; ranking per gra live na profilu i w katalogu.

---

## Decyzje (ADR-skróty — pełne do dopisania w `ARCHITECTURE.md`)

### Gry wbudowane vs zewnętrzne (nowa, sesja 2026-07-12)
**Why:** plan zakładał „RPS przechodzi na bundle" jako wzorzec dla wszystkich gier. Piotr doprecyzował model: RPS (i ewentualne 1–2 kolejne first-party) to stały element aplikacji platformy, niekonfigurowany przez nikogo; otwarcie dotyczy wyłącznie gier deweloperów — zawsze zewnętrznych (flagowy przykład: arrowsoccer na własnej domenie).
**What:** dwie klasy gier. **Wbudowane:** UI w aplikacji web, logika jako serwis w naszym compose, ale przez TEN SAM wire contract (dogfooding); ranked natywnie, bez bundla/CSP — filar 2 broni sekretu przed deweloperem gry, a tu deweloperem jesteśmy my. **Zewnętrzne:** logika + UI na infrze deva; casual z etykietą „UI poza platformą"; ranked dopiero z bundlem u nas.
**Watch out:** pokusa „specjalnych ścieżek" dla wbudowanych w silniku — kontrakt ma zostać jeden; wbudowane różnią się wyłącznie hostingiem UI i domyślnym zaufaniem.

### Ranked gier zewnętrznych = bundle u nas + CSP; budowa PRZESUNIĘTA poza Etap 4
**Why:** po decyzji o grach wbudowanych jedynym konsumentem hostingu bundli byłaby przyszła zewnętrzna gra rankingowa (pierwsza znana: arrowsoccer, Etap 6); w Etapie 4 ranked działa na wbudowanym RPS bez tej infrastruktury.
**What:** zasada bez zmian (filar 2 „Safe secret"): zewnętrzna gra gra ranked tylko z UI wgranym do nas jako statyczny bundle i serwowanym z CSP. Budowa (publish-ui, osobna domena D2, S3 e2e, osadzenie iframe/handoff) — dopiero przy pierwszym realnym konsumencie.
**Watch out:** (1) **D2 pozostaje decyzją zapisaną TERAZ:** bundle z osobnej domeny rejestrowalnej (wzorzec `googleusercontent.com`), cookies platformy host-only — origin zaszywa się w tokenach i CSP, zmiana po fakcie kosztowna. (2) Kanały nawigacyjne (D1) rezydualne — detekcja (Etap 5) to siatka, nie gwarancja. (3) Dev-środowisko bez domen: cookies NIE rozróżniają portów, test izolacji wymaga osobnego hostname (hosts/lvh.me) — zapisać przy projektowaniu hostingu.

### Czat renderuje platforma, nie aplikacja gry
**Why:** aplikacja gry z dostępem do treści czatu = boczny kanał i wektor phishingu; scoped token meczu celowo nie daje dostępu do `messages`/`friendships`.
**What:** czat lobby/meczu żyje w powłoce platformy; aplikacja gry (zewnętrzna dziś, bundle w przyszłości) dostaje tylko token meczu do `submit-move`/`reveal-done`/`prefs`. Dla wbudowanego RPS czat-overlay z 4b spełnia to z definicji.
**Watch out:** przy pełnym redirect na domenę deva (4d, casual) gracz NIE MA czatu platformy w trakcie meczu — świadomy koszt tej ścieżki; wróci przy projektowaniu osadzenia bundli (iframe vs redirect).

## Uwagi przekrojowe

- **Liczby to konfiguracja** (K, okna matchmakingu, TTL, limity gościa, retencja) — parametry od dnia 1, kalibracja po playtestach (dane telemetryczne z 2c, `UNKNOWNS.md`).
- **Wolumen streamów (B4):** presence + friends + czat to nowe, gadatliwe subskrypcje — wpiąć `$match` po kolekcji i indeks `kolekcja → tickets` (zaplanowane w 2e) zanim społeczność wejdzie na żywo; obserwować CPU dopasowywania streamów.
- **Co świadomie NIE wchodzi w Etap 4:** `trust_events`/renoma/sprawdzalność/`judge`/pułapki z botami (Etap 5 — tu tylko hak na bota i ODCZYT adnotacji), automatyczny pipeline walidacji rejestracji (Etap 5 — w 4d approve ręczny), hosting bundli UI + CSP + S3 (przesunięte — patrz decyzje), snajperzy i arrowsoccer (Etap 5/6). Ranked w Etapie 4 = wyłącznie gry wbudowane, bez progów zaufania — bramkowanie ranked renomą/sprawdzalnością dochodzi w Etapie 5.
- **Wzorzec pracy (sprawdzony w Etapie 2/Fali 3):** rozłączne obszary agentami spięte jednym kontraktem-plikiem, potem integracja i weryfikacja krzyżowa; skille `back`/`front`/`data`/`test` per zadanie; weryfikacja live po stronie Piotra (sandbox nie odpala Dockera/testów).

## Otwarte pytania

- **Przesunięte razem z hostingiem bundli (wrócą przy pierwszej zewnętrznej grze ranked):** sandbox iframe (D1), kształt handoffu tokenu do bundla (postMessage vs URL-fragment), layout czatu obok bundla, symulacja osobnej domeny w dev (hosts/lvh.me — cookies nie rozróżniają portów).
- **Approve gier w 4d:** panel admina w web czy na start skrypt/komenda (wzór `games-register`)? Tanio zacząć od komendy, panel gdy będzie więcej niż garść gier.
- **Zakres konta dewelopera w 4d:** limity (ile gier per konto), edycja po publish — zmiana `uiUrl`/URL logiki to potencjalna podmiana gry: czy wymaga ponownego approve? (rekomendacja: tak).
- **Presence a prywatność:** czy `currentMatchId` widoczny dla wszystkich znajomych, czy z opcją „tryb niewidzialny"? (prefs gracza, tanie do dołożenia w 4a).
- **ELO a niedomyślne presety:** plan trzyma ELO tylko dla domyślnego presetu — czy warianty (np. RPS do innej liczby punktów) dostają osobne, nierankingowe leaderboardy? (odłożone, ale zanotować).
