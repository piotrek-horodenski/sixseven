# sixseven — plan implementacji

> Dokument wykonawczy. Architektura: `ARCHITECTURE.md` · DX deweloperów: `GAME_DEV_GUIDE.md` · flagowiec: `games/ARROWSOCCER.md`. Wszystkie liczby (progi, wagi, budżety) to propozycje startowe do kalibracji — są parametrami konfiguracji, nie stałymi w kodzie.

## Zasada organizująca: sekret jest walutą

Produktowo platforma jest **powiernikiem sekretów**: gracze powierzają jej zaplanowane ruchy, a ona gwarantuje, że nikt — ani przeciwnik, ani twórca gry — nie pozna ich przed czasem. Wszystko inne (matchmaking, rating, społeczność, katalog) istnieje po to, żeby ta gwarancja miała gdzie zarabiać.

Z tego wynika reguła projektowa dla każdego modułu: **najpierw pytamy, co moduł robi z sekretem, potem co robi w ogóle.** A dla deweloperów: zaufanie (renoma × sprawdzalność) jest kapitałem, który kupuje przywileje — i którego jedynym źródłem jest niesprzeczna współpraca z powiernikiem.

## Cykl życia sekretu (kręgosłup logiki biznesowej)

| # | Stan ruchu | Gdzie żyje | Kto zna treść | Przejście dalej |
|---|---|---|---|---|
| 1 | **Szkic** | pamięć aplikacji UI gracza | gracz (+ kod UI gry — stąd poziomy zaufania UI) | `submit-move` |
| 2 | **Złożony** | kolekcja prywatna `moves` (games) | nikt poza silnikiem; świat widzi tylko `ready=true` | zamknięcie fazy (deadline / komplet) |
| 3 | **Zapieczętowany** | snapshot rundy w `moves` | jw.; ruchu nie można już zmienić | wysyłka do logiki |
| 4 | **Ujawniony logice** | żądanie `/resolve` (podpisane) | + serwis gry (już nie może nic zmienić dla graczy — faza zamknięta) | odpowiedź `/resolve` |
| 5 | **Ujawniony światu** | `match_events`, `match_views` | wszyscy uczestnicy (widzowie później) | koniec rundy |
| 6 | **Historyczny** | `match_events` (append-only) + log wejść/wyjść `/resolve` | uczestnicy; platforma używa do replay-auditów | nigdy nie znika |

Inwarianty egzekwowane testami (patrz „Testy sekretu"):
- **I1:** treść ruchu nie występuje w żadnej kolekcji subskrybowalnej ani odpowiedzi API przed stanem 5.
- **I2:** żadne wywołanie do serwisu gry nie zawiera ruchu przed stanem 4 (w fazie planowania serwis gry nie jest wołany wcale).
- **I3:** ack `ready` jest emitowany natychmiast po przyjęciu (stały czas), by timing nie niósł informacji.
- **I4:** zmiana złożonego ruchu jest możliwa tylko do zamknięcia fazy i tylko przez właściciela (nadpisanie w `moves`).
- **I5:** stan 6 jest niemutowalny; log `/resolve` wystarcza do powtórzenia każdej rundy bajt w bajt.

## Model danych — kolekcje i polityki dostępu

Baza platformy (subskrybowalna przez gate, polityki row-level):

| Kolekcja | Kluczowe pola | Polityka odczytu (filtr wstrzykiwany) | Pisze |
|---|---|---|---|
| `users` | username, email, hasło (bcrypt), roles, profile | własny dokument pełny; cudze: profil publiczny (sanityzacja pól) | gate |
| `games` | manifest, status, **renoma, sprawdzalność**, urls, devAccountId, kwoty | publiczna (bez urls/sekretów — sanityzacja) | games (registry, trust) |
| `matches` | gameId, players[], guestIds[], phase, round, deadline, ready{}, score, options, rankingowy:bool | `players zawiera user` LUB (publiczny mecz: pola okrojone) | games (engine) |
| `match_views` | matchId, playerId, view, round | **`playerId == user`** — filtr serwera, bezwzględny | games |
| `match_events` | matchId, round, events[], points, revealDurationMs | uczestnicy meczu; po zakończeniu meczu: publiczne (historia/replay) | games |
| `rooms` | gameId, hostId, options, preset, visibility, code, members[], state | publiczne LUB `members zawiera user` LUB znający `code` | games |
| `queue` | gameId, userId, elo, since | tylko własne wpisy | games |
| `presence` | userId, status (online/lobby/match), lastSeen, currentMatchId | publiczna (sam status), szczegóły dla znajomych | gate |
| `ratings` | userId, gameId, elo, matches, K | publiczna | games |
| `annotations` | playerId, gameId, badgeId, params, sentiment, earnedAt | `sentiment=='positive' OR playerId==user` | games |
| `friendships` | a, b, status (invited/accepted) | uczestnicy | gate |
| `messages` | roomId/matchId, authorId, text, ts | członkowie pokoju/meczu | gate |
| `trust_events` | subjectType (game/devAccount), subjectId, type, waga, kontekst, dowód | dev: własne; admin: wszystkie | games (silnik), judge (werdykty) |
| `audit_cases` | subjectId, sygnały, audyty, dowody, status | tylko admin | judge |

Kolekcje prywatne games (gate nigdy ich nie wystawia): `moves` (ruchy rund — sekret w stanach 2–4), `match_states` (stan autorytatywny per runda), `player_memory` (data + prefs per gracz per gra), `resolve_log` (wejście/wyjście każdego `/resolve` — paliwo replay-auditów), `registrations` (sekrety HMAC, handoff codes, dev tokens).

## Tożsamość i tokeny

| Token | Kto dostaje | Zakres | TTL |
|---|---|---|---|
| JWT użytkownika | zalogowany gracz | pełne API wg RBAC | 7 dni, rewokacja w DB **per sesja** (model wielotokenowy `users.sessions[]`: login dokłada sesję, logout usuwa bieżącą, „wyloguj wszędzie" czyści listę) |
| **Sesja gościa** | wejście z linku pokoju bez konta | dołączenie do tego pokoju, gra casual, czat pokoju; zero rankingu, historii, znajomych | 24 h |
| Kod handoff | przekierowanie do aplikacji gry | jednorazowa wymiana na token meczu | 60 s, jednorazowy |
| **Token meczu (scoped)** | aplikacja gry po wymianie kodu | subskrypcja własnego `match_views` + `matches` tego meczu, `submit-move`, `reveal-done`, zapis `prefs` | do końca meczu |
| Token dewelopera | dev z profilu | rejestracja gier, status, publish-ui | odwoływalny |
| Podpis HMAC | platforma → serwis gry | uwierzytelnienie żądań silnika | timestamp ± 30 s |

**Goście — logika biznesowa:** nick tymczasowy z widocznym oznaczeniem (`Piotr (gość)`); gra wyłącznie mecze towarzyskie; po meczu ekran „załóż konto, żeby zachować wynik" — konwersja podpina mecze gościa z ostatnich 7 dni (klucz: cookie sesji gościa). Goście nie generują ELO, nie liczą się do sprawdzalności gier (waga 0 — anti-farming), limit N meczów dziennie per cookie/IP przeciw spamowi.

## Maszyna stanów meczu — pełna logika

```
Lobby ──(komplet graczy + opcje ustawione + wszyscy ready)──► Planning
Planning ──(deadline LUB komplet ruchów)──► Resolving
Resolving ──(odpowiedź /resolve OK)──► Revealing
Resolving ──(3× fail: timeout/schemat)──► Paused
Revealing ──(komplet reveal-done LUB revealDuration+2s)──► Planning | Finished
Paused ──(serwis gry wrócił: health-check OK)──► Resolving (retry)
Paused ──(10 min)──► Cancelled
Lobby ──(host wyszedł / 15 min bez kompletu)──► Cancelled
```

- **Planning:** czas z manifestu/opcji (≥ 2000 ms). Ruch można nadpisywać do deadline (nadpisanie pisze wyłącznie do prywatnej `moves` — nigdy do kolekcji subskrybowalnych; `ready` ustawiane raz). Brak ruchu → gracz trafia na listę spóźnionych w `/resolve` (gra stosuje `defaultMove`).
- **Zapieczętowanie (`sealed`):** zamknięcie fazy zapisuje **trwałą, atomową** subfazę `sealed` per runda w `match_states` **przed** wysłaniem `/resolve` (stan 3 cyklu sekretu). Od tej chwili ruchy są zamrożone; to punkt bez powrotu, na którym opiera się bezpieczna rehydracja po awarii. *(A1)*
- **Resolving:** budżet 2 s, retry ×3 z backoffem 2/4/8 s. Każdy fail = `trust_event`. Zapis wyniku rundy (`match_events` + `matches` + `match_views` ×N) w **jednej transakcji multi-dokumentowej** — change streamy emitują dopiero po commicie, więc fan-out jest spójny, a crash w połowie nie zostawia częściowego stanu (klient nigdy nie widzi nowej fazy bez nowego widoku). *(A2)*
- **Revealing:** tylko gdy `revealDurationMs > 0`; inaczej od razu Planning/Finished. Margines +2 s. `reveal-done` przyjmowany wyłącznie z tokenem meczu danego gracza.
- **Rozłączenia:** ruchy złożone zostają; brak ruchu = defaultMove. Rozłączony przez 2 kolejne rundy w meczu rankingowym → walkower.
- **Walkower (ranked):** porzucający dostaje przegraną z pełnym K; pozostały wygraną z **połową K** (farming walkowerów mało opłacalny). Casual: mecz kończy się bez wpisów ELO.
- **Cancelled:** zero zmian ELO, zero adnotacji; `match_events` oznaczone `cancelled` (historia zostaje).
- **Restart games:** rehydracja z `match_states` + `moves`. Runda **`sealed`** → ponowny `/resolve` z tymi samymi zapieczętowanymi ruchami (bezpieczne dzięki determinizmowi), **nigdy** powrót do Planning — inaczej gracze mogliby zmienić ruchy, które serwis gry już zna, a `resolve_log` miałby wpis niezgodny z powtórką (fałszywe pozytywy replay-auditu). Tylko runda **niezapieczętowana** restartuje Planning z pełnym czasem. *(A1)*

## Logika modułów

### Silnik zaufania (trust engine)

Obserwacje (`trust_events`) i ich skutki — Δrenoma w punktach (0–100), sprawdzalność w obserwacjach ważonych:

| Typ | Δ renomy | Waga sprawdzalności | Źródło |
|---|---|---|---|
| resolve OK (spójny, w budżecie) | 0 | +1 | silnik |
| mecz ukończony, gracze unikalni i niepowiązani | 0 | +5 | silnik |
| audyt: replay zgodny | 0 | +10 | audytor |
| audyt: lustro zgodne | 0 | +10 | audytor |
| pułapka czysta | 0 | +20 | audytor |
| timeout rundy | −0,5 | +1 | silnik |
| odpowiedź poza schematem / limit rozmiaru | −2 | +2 | silnik |
| nieznany badgeId, nadużycie adnotacji | −5 | +5 | silnik |
| **replay niezgodny** (determinizm/podmiana logiki) | −15 | +15 | audytor |
| **lustro niezgodne** (faworyzowanie gracza) | −40 | +40 | audytor |
| **pułapka: potwierdzony przeciek** | −100 | +100 | audytor |

Formuły (parametry konfigurowalne):
- **Sprawdzalność** = `100 · (1 − e^(−W/500))`, gdzie W = suma wag obserwacji. Waga meczu skalowana unikalnością graczy (nowa para niepowiązanych kont ×1; ta sama para po raz n-ty ×1/n; konta powiązane heurystyką IP/wieku ×0).
- **Renoma**: start = renoma konta deweloperskiego (nowe konto: 100). Spadki natychmiastowe. **Odbudowa:** za każdy pełny miesiąc bez ujemnych zdarzeń `renoma += (cap − renoma) · 0,1`, gdzie `cap = 95` jeśli w historii jest jakikolwiek incydent (asymptotycznie, nigdy do 100).
- **Konto deweloperskie**: renoma konta = średnia renom gier ważona sprawdzalnością; nowa gra dziedziczy renomę konta i **bonus startowy sprawdzalności** = 10% sprawdzalności konta (weteran nie zaczyna od zera, oszust nie resetuje się nową grą).
- **Zaufanie efektywne** = `renoma · (0,3 + 0,7 · sprawdzalność/100)` — nowa gra (100 × 0,3 = 30) ma mniej praw niż sprawdzona z renomą 90.

Progi przywilejów (zaufanie efektywne):

| Próg | Przywilej |
|---|---|
| < 20 | unpublish (gra znika z katalogu do wyjaśnienia) |
| ≥ 20 | katalog, mecze towarzyskie |
| ≥ 45 | ~~ranked / szybki mecz~~ *(wycofane 2026-07-12: gry zewnętrzne nie grają ranked — ADR „Gry zewnętrzne = tylko towarzyskie"; próg zostaje wolny do przyszłego użycia)* |
| ≥ 60 | limit meczów równoległych ×5 (bazowo 20) |
| ≥ 75 | publikacja nowej wersji manifestu bez ręcznego approve |
| ≥ 85 | rzadszy reżim audytów, wyróżnienie „sprawdzona" |

### `judge` — sędzia prawdy (osobny mikroserwis)

Audyt integralności jako oddzielny serwis: asynchroniczny, z własnym budżetem, widokiem między grami i kontami devów; jego awaria nie dotyka meczów. Dwie twardo rozdzielone warstwy:

- **Targeting — kogo poddać testom:** heurystyki (anomalie win-rate, statystyka kontr, wzorce czasowe, grafy powiązanych kont, historia trust_events dewelopera) + **zgłoszenia graczy** („zgłoś, że coś było nie tak" po meczu; ważone anty-brigadingowo, nigdy nie są dowodem — tylko wskazują, gdzie patrzeć) + ręczne zlecenia admina + opcjonalnie AI. Tryb konfigurowalny przez admina platformy: `off` (tylko harmonogram bazowy + zlecenia ręczne) / `assist` (AI podpowiada adminowi cele z uzasadnieniem) / `auto` (AI sam alokuje budżet audytów w ramach limitów).
- **Werdykty — czy winny:** wyłącznie deterministyczne dowody (replay niezgodny, lustro niesymetryczne, przeciek w pułapce). **AI wybiera cele, nigdy nie ferruje wyroków.** Każdy werdykt = `trust_event` z załączonym dowodem (wejście/wyjście do odtworzenia).

Sędzia prowadzi `audit_cases` — dossier per gra i per konto deweloperskie (sygnały, zlecone audyty, dowody, werdykty) — to jest panel admina „kto ewentualnie oszukuje". Dostęp: odczyt `resolve_log` i statystyk games (read-only), wywołania audytowe do serwisów gier (nieodróżnialne od produkcji), zapis `trust_events`/`audit_cases`.

Harmonogram bazowy — niezapowiedziany, wpleciony w ruch produkcyjny, częstotliwość odwrotna do zaufania:

| Zaufanie efektywne | replay-audit | test lustrzany | pułapka |
|---|---|---|---|
| < 45 | 5% rund | 2% rund | 1/tydzień |
| 45–85 | 1% | 0,5% | 1/2 tyg. |
| > 85 | 0,2% | 0,1% | 1/mies. |

Pułapki wymagają bota per gra — MVP: boty tylko dla naszych gier (RPS, snajperzy, arrowsoccer); dla obcych gier pułapki startują, gdy dev opcjonalnie dostarczy bota (zachęta: szybszy wzrost sprawdzalności; NIE jest warunkiem niczego — decyzja 2026-07-12), inaczej tylko replay+lustro. **Rola botów jest podwójna (decyzja 2026-07-12): primarnie zawodnicy** — bot nieodróżnialny od gracza dołącza np. do pustego lobby, żeby zawsze było z kim grać — **wtórnie instrument audytowy** (pułapki, testowanie zewnętrznych aplikacji). Ta sama tożsamość „zwykłego gracza" obsługuje oba cele.

### Matchmaking i pokoje

- **Szybki mecz (ranked):** wymaga konta, gra ranked-eligible, domyślny preset. Dobór: |ΔELO| ≤ 100, okno +50 co 10 s, max 400. Po dopasowaniu 10 s na potwierdzenie („accept"), brak = powrót na koniec kolejki.
- **Pokoje:** host wybiera grę, preset/suwaki (schemat z manifestu), visibility. Publiczne na liście (subskrypcja `rooms`), prywatne przez kod/link (`/r/AB3X`, 6 znaków, TTL 24 h). Pokój z niedomyślnym presetem = zawsze casual (oznaczenie przy tworzeniu).
- **Kwoty:** gra ma limit meczów równoległych z progów zaufania; przekroczenie = kolejka pokojów czeka, komunikat „gra u szczytu popularności".

### ELO (per gra, tylko domyślny preset)

Start 1200. K = 32 przez pierwsze 30 meczów, potem 16, od 2400: 10. Aktualizacja po `Finished` z `winnerIds` (remis = 0,5). Walkower jw. Mecze z gośćmi, niedomyślnym presetem, anulowane i towarzyskie nie dotykają ELO. Ranking per gra publiczny (kolekcja `ratings`), pozycja gracza na profilu.

### Adnotacje i pamięć gry

Jak w `ARCHITECTURE.md` (decyzja „Adnotacje"): `data` ≤ 4 KB pisane przez `/annotate` po meczu, `prefs` ≤ 4 KB pisane tokenem meczu, oba wracają w `/init`. `grant`/`revoke` tylko z puli manifestu; positive publiczne, reszta widoczna tylko dla gracza. Nadużycia = trust_event. Adnotacje z meczów anulowanych nie są aplikowane.

### Rejestracja gry (self-service, etap 5)

`registered → validating → validated → (approve | auto gdy próg ≥ 75) → published`, `rejected` z raportem. Walidacja: schemat manifestu (w tym `planningPhaseMs ≥ 2000`, sentiment odznak), osiągalność URL-i, zdalne kontrakt-testy (harness = `sixseven-sdk test`), przegląd tekstów odznak (moderacja). Zmiana manifestu = ponowna walidacja; zmiana samej logiki = wykryje ją replay-audit (dev ma obowiązek kompatybilności stanu).

## Etapy implementacji

Każdy etap ma kryteria akceptacji; testy sekretu (S1–S5, niżej) wchodzą do CI od etapu, w którym powstaje testowany mechanizm.

**Etap 0 — Repo i porządki (fundament z hydry).**
Monorepo platform: `gate/`, `web/`, `image/`, `games/` (nowy), `packages/sdk`. Wycięcie domeny studia (engines/clusters/projects/concepts + moduły web), `cfg/` → `.env`, rotacja `JWT_SECRET`, reseed ról, usunięcie `new/`, fix persystencji motywu, naprawa multi-device dedupe subskrypcji.
*Akceptacja:* czysty boot gate+web z loginem/rejestracją; testy hydry zielone po wycince.

**Etap 1 — Sekret ma dom: polityki i tokeny.**
Deklaratywne polityki subskrypcji z filtrem wstrzykiwanym (rejestr per kolekcja — tabela z tego planu), sanityzacja pól per polityka, sesje gościa, kody handoff + tokeny meczu, podpisy HMAC (moduł wspólny), `useCollection` w web.
*Akceptacja:* S1 (test: konto-szpieg z dowolnymi filtrami nie widzi cudzych `match_views` ani `moves` — kolekcja niewystawiona); token meczu nie otwiera niczego poza swoim meczem.

**Etap 2 — Silnik meczu + pierwszy sekret end-to-end (RPS).**
Maszyna stanów pełna (z Paused/Cancelled), kolekcje prywatne games, `resolve_log`, wire contract + `sixseven-sdk serve` + harness `sixseven-sdk test`, RPS jako zdalny serwis + aplikacja UI (handoff, powrót z wynikiem), pokój przez link (w tym goście), ekran wyniku w web.
*Akceptacja:* S2, S3 (I1–I5 jako testy integracyjne); dwóch ludzi gra w RPS z telefonów przez link; wyłączenie serwisu RPS w trakcie rundy → Paused → powrót → mecz dograny; restart games w trakcie meczu → mecz dograny.

**Etap 3 — Znajdowanie współgraczy.**
Kolejka szybkiego meczu (na razie bez ELO — FIFO + accept), lista pokoi publicznych, presence, opcje meczu w lobby (schemat z manifestu, generyczny renderer), toast manager, kwoty równoległych meczów (stała bazowa).
*Akceptacja:* pełny przepływ: katalog → szybki mecz → gra → wynik → rewanż; presence live na liście znajomych pokoju.

**Etap 4 — Stawka, społeczność i otwarcie na gry zewnętrzne.** *(zredefiniowany 2026-07-12 — szczegóły i podetapy: `docs/ETAP4_PLAN.md`; ADR-y „Gry wbudowane vs zewnętrzne" i „Gry zewnętrzne = tylko towarzyskie")*
Znajomi + presence, czat lobby/meczu, adnotacje + profile, konwersja gościa w konto (4a–4c — ZROBIONE); **gry zewnętrzne casual** — konta deweloperów, rejestracja gry (ręczny approve admina), katalog data-driven, przekierowanie na UI deva z handoffem cross-origin (4d); **ranked na grach wbudowanych** — ELO + walkowery + kolejka szybkiego meczu na wbudowanym RPS (4e). **Gry zewnętrzne NIE grają ranked w ogóle** (decyzja 2026-07-12, sesja 2) — hosting bundli UI + CSP usunięty z planu (nie tylko przesunięty).
*Akceptacja:* deweloper bez uprawnień admina rejestruje grę i gracz gra ją end-to-end na domenie deva (casual); token meczu z obcego originu nie otwiera nic poza swoim meczem; walkower liczy ELO wg reguł; adnotacja negative niewidoczna dla innych.

**Etap 5 — Gospodarka zaufania.**
`trust_events` + agregaty + formuły + progi (konfiguracja), mikroserwis **`judge`** (harmonogram bazowy replay + lustro, pułapki dla naszych gier z botami, `audit_cases`, tryb targetingu `off`/ręczny; warstwa AI w trybie `assist`/`auto` jako opcja po stabilizacji sygnałów), **automatyczny pipeline walidacji rejestracji** (zdalne kontrakt-testy, stany `validating/validated`, auto-approve od progu — konta devów i ręczny approve istnieją od Etapu 4d), dziedziczenie renomy konta, **pojedynek snajperów** jako druga gra — rejestrowana wyłącznie ścieżką self-service (dogfooding) i test krótkich tur (3 s).
*Akceptacja:* S4, S5 (celowo zepsute serwisy-fixtury: niedeterministyczny i faworyzujący — audytor je łapie, renoma spada, unpublish poniżej progu); snajperzy grywalni przy 3-sekundowych turach; katalog pokazuje renomę/sprawdzalność live.

**Etap 6 — Flagowiec i tutorial.** *(odchudzony 2026-07-12, sesja 2: hosting bundli + CSP + D2 + S3 USUNIĘTE z planu — ADR „Gry zewnętrzne = tylko towarzyskie")*
Arrowsoccer (wg `games/ARROWSOCCER.md`): moduł fizyki kwantowej (współdzielony), serwis logiki, UI three.js na własnej domenie (casual). **DECYZJA OTWARTA przed startem etapu:** arrowsoccer jako gra zewnętrzna gra tylko casual; jeśli ma grać ranked — musi być grą wbudowaną (first-party). Opcje fizyki, formacje w prefs, odznaki, bot do pułapek. Tutorial publiczny: „od `npm create` do published" na przykładzie easy (RPS — z zastrzeżeniem, że RPS jest wbudowany; przykład rejestracji = snajperzy) i zaawansowanym (arrowsoccer). Playtesty i kalibracja parametrów zaufania.
*Akceptacja:* arrowsoccer przechodzi całą ścieżkę zewnętrznego deva bez używania uprawnień admina (casual end-to-end na domenie deva); mecz na telefonie (portrait) z animacją siatki; tutorial wykonalny przez osobę spoza projektu.

## Testy sekretu (stały pakiet w CI)

- **S1 — Szpieg API:** konto z ważnym JWT próbuje wszystkich kolekcji i filtrów — nigdy nie widzi treści cudzego ruchu przed reveal ani cudzych `match_views`/`prefs`/`data`.
- **S2 — Głuchy dev:** mock serwisu gry rejestruje wszystkie wywołania — żadne nie zawiera ruchu przed zamknięciem fazy; timing acków `ready` stały. Dodatkowo: **wielokrotne nadpisanie złożonego ruchu nie generuje żadnego zdarzenia w kolekcjach subskrybowalnych** (nadpisanie dotyka tylko prywatnej `moves`; „przeciwnik zmienia zdanie N razy" nie może być obserwowalną informacją). *(A3)*
- **S3 — Niemy bundle:** *(WYCOFANY 2026-07-12 razem z hostingiem bundli — ADR „Gry zewnętrzne = tylko towarzyskie". Zapis zostaje jako historia: gdyby bundle kiedyś wrócił, wraca i ten test.)* Zaufany bundle UI z wstrzykniętą próbą eksfiltracji — blokowaną przez CSP w prawdziwej przeglądarce (test e2e), łącznie z kanałami nawigacyjnymi. *(D1)*
- **S4 — Fałszerz:** serwis-fixtura zmieniający odpowiedzi między wywołaniami — replay-audit go wykrywa, trust spada zgodnie z tabelą.
- **S5 — Stronniczy sędzia:** serwis-fixtura faworyzujący gracza po ID — test lustrzany go wykrywa.

## Pozostałe otwarte pytania

- Kalibracja wszystkich liczb (progi, wagi, K, okna matchmakingu) — po playtestach etapu 3+; liczby w konfiguracji od dnia 1.
- Heurystyka „graczy powiązanych" do wag sprawdzalności (IP, wiek konta, grafy wspólnych meczów) — wersja naiwna w etapie 5, iteracje później.
- Widzowie i replaye publiczne (dane są w `match_events`) — po MVP.
- Hosting „managed" logiki (bundle w sandboxie) jako łatwiejsza ścieżka wejścia — tylko jeśli będzie popyt; wraca problem sandboxa.
- Monetyzacja (nie projektowana): naturalne haki to progi zaufania, kwoty meczów i wyróżnienia katalogu — decyzja odłożona świadomie.
