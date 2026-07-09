# Etap 2 — plan podetapów

> Etap 2 to największy i najbardziej ryzykowny etap (ryzyko `G1` w `IMPLEMENTATION_RISKS.md`): silnik meczu + maszyna stanów + SDK + wire contract + harness + RPS (serwis i UI) + handoff/tokeny + pokój przez link + ekran wyniku. Tnie się go na wewnętrzne milestone'y z **własnymi** testami, żeby każdy zamykał się osobno. Bramka końcowa całego Etapu 2 zostaje bez zmian: **dwóch ludzi gra w RPS z telefonów przez link**.
>
> Bazuje na: `IMPLEMENTATION_PLAN.md` (cykl życia sekretu, maszyna stanów, tokeny, testy S1–S5, inwarianty I1–I5), `ARCHITECTURE.md` (wire contract, `/resolve`) i poprawkach ryzyk naniesionych jako prerekwizyty (A1 sealed, A2 atomowość, A4 idempotencja, A5 timery w DB, C1 SSRF, C2 budżet czasu, C3 wersja manifestu, E2 retencja `resolve_log`).

## Mapa podetapów

| Podetap | Cel jednym zdaniem | Zależy od | Bramka |
|---|---|---|---|
| **2a** | Silnik: maszyna stanów + kolekcje prywatne + pętla deadline'ów, sterowany serwisem-fake po HTTP | Etap 1 | Faza pełnego cyklu rundy z fake serwisem; rehydracja i Paused działają |
| **2b** | Wire contract + SDK: `sixseven-sdk serve` + harness `test`, HMAC i SSRF w realnym użyciu | 2a | Silnik woła realny `serve`; harness łapie zepsuty serwis; SSRF zablokowany |
| **2c** | RPS jako zdalny serwis + silnik end-to-end na pełnym JWT (bez handoffu) | 2b | Zalogowany gracz gra RPS w web; S2 zielone; `match_views` tylko własne |
| **2d** | Pokoje przez link + goście + handoff + tokeny meczu + aplikacja UI RPS | 2c | **Dwóch ludzi gra RPS z telefonów przez link** (bramka Etapu 2) |
| **2e** | Hartowanie i pomiar: pełna odporność awaryjna + benchmark wolumenu streamów | 2d | Serwis RPS off w trakcie → Paused → dograne; benchmark przed Etapem 3 |

Testy sekretu wchodzą do CI w podetapie, w którym powstaje testowany mechanizm.

---

## 2a — Szkielet silnika: maszyna stanów + kolekcje prywatne + pętla deadline'ów

**Cel.** Kompletny, deterministyczny silnik rundy sterowany **serwisem-fake gry po HTTP na localhost** (stub `/resolve`). Bez SDK, bez RPS, bez UI — czysta mechanika cyklu sekretu, testowalna w izolacji.

**Deliverables.**
- Kolekcje prywatne games (gate nigdy ich nie wystawia — chroni je default-deny z Etapu 1): `moves`, `match_states` (z subfazą `sealed` per runda), `resolve_log`, `player_memory`.
- Kolekcja subskrybowalna `matches` (faza, runda, `deadline`, `ready{}`, score) i `match_views` (row-level z Etapu 1 wchodzi w życie od chwili zapisu).
- Pełna maszyna stanów: `Lobby → Planning → (seal) → Resolving → Revealing → Planning|Finished`, plus `Paused` i `Cancelled`. Przejścia **idempotentne** (warunkowy update: „zamknij fazę tylko jeśli nadal `planning` i `round == N`").
- **Zapieczętowanie (`sealed`)** jako trwałe, atomowe przejście zapisywane **przed** `/resolve` (A1).
- **Atomowy zapis wyniku** rundy (`match_events` + `matches` + `match_views` ×N) w jednej transakcji multi-dokumentowej (A2).
- **Deadline'y w dokumentach** (`matches.deadline` + indeks) + jedna pętla harmonogramu skanująca przeterminowane — **nie `setTimeout`** (A5).
- `resolve_log`: wejście/wyjście każdego `/resolve`, wszystkie próby retry oznaczone (A4), wersja manifestu (C3), polityka retencji parametryzowana (E2).
- Retry `/resolve`: budżet + backoff 2/4/8 s, ×3 → `Paused`; health-check → retry; 10 min → `Cancelled`.

**Testy do CI.**
- Inwarianty **I1–I5** jako testy integracyjne (treść ruchu nie w kolekcji subskrybowalnej przed reveal; `/resolve` nie wołane w planowaniu; ack `ready` stały; nadpisanie tylko do deadline i tylko przez właściciela; stan 6 niemutowalny, log wystarcza do bajt-w-bajt replay).
- Maszyna stanów: unit na każde przejście + idempotencja (podwójny trigger nie psuje stanu).
- A2: crash w połowie zapisu nie zostawia częściowego stanu widocznego w streamie.

**Akceptacja.** Pełny cykl rundy z fake serwisem; restart w trakcie → runda `sealed` re-resolvuje się tymi samymi ruchami, `unsealed` restartuje Planning; timeout `/resolve` ×3 → `Paused` → health-ok → retry → mecz dograny.

---

## 2b — Wire contract + SDK (`serve` + harness `test`)

**Cel.** Ustandaryzować kontrakt silnik↔serwis gry i dać deweloperowi narzędzia: serwer deweloperski i harness kontrakt-testów. HMAC i ochrona SSRF wchodzą do realnego użycia.

**Deliverables.**
- `packages/sdk`: typy wire contract (`init`, `resolve`, `validateMove`, `defaultMove`, `annotate`), interfejs `GameDefinition`.
- `sixseven-sdk serve` — opakowuje `GameDefinition` w serwis HTTP: weryfikacja podpisu HMAC (`packages/hmac`), walidacja strukturalna + limity rozmiaru, egzekucja `validateMove` wewnątrz `/resolve` (nielegalny ruch → `defaultMove`, raport w `events`).
- `sixseven-sdk test` — harness kontrakt-testów: determinizm (replay daje identyczny wynik), zgodność ze schematem, budżet czasu, idempotencja retry po `(matchId, round)`.
- **SSRF guard** (C1) po stronie silnika: resolve DNS → odrzuć zakresy prywatne/link-local (w tym `169.254.169.254`) → pin IP na czas żądania; zakaz redirectów; limit rozmiaru odpowiedzi strumieniowo.
- **Budżet czasu** (C2) zdefiniowany w wire contract: connect timeout / całkowity budżet od wysłania do odczytania body / max body; keep-alive pool per serwis gry.

**Testy do CI.**
- Harness łapie celowo **niedeterministyczny** i **poza-schematem** serwis-fixturę.
- HMAC: żądanie bez/ze złym podpisem lub poza oknem ±30 s odrzucone.
- SSRF: żądanie do `localhost`/adresu prywatnego/metadata-endpointu odrzucone; redirect nie jest podążany.

**Akceptacja.** Silnik z 2a woła realny `sixseven-sdk serve` (przykładowa `GameDefinition`) zamiast fake stubu; harness przechodzi dla poprawnego serwisu i wykrywa zepsuty.

---

## 2c — RPS jako zdalny serwis + silnik end-to-end (pełny JWT, bez handoffu)

**Cel.** Pierwszy sekret end-to-end na prawdziwej grze i prawdziwym web — jeszcze bez handoffu (gracz gra na pełnym JWT w web), żeby odseparować logikę meczu od przepływu tokenów meczu.

**Deliverables.**
- RPS `GameDefinition` (`init`, `resolve`, `validateMove`, `defaultMove`) na SDK, uruchomiony jako zdalny serwis (`serve`).
- Minimalna rejestracja RPS (seed/ręcznie — pełny pipeline dopiero w Etapie 5): manifest, URL serwisu, sekret HMAC.
- Silnik gra pełną rundę RPS: `submit-move` → `moves` → `seal` → `/resolve` → reveal → wynik; `match_views` per gracz.
- `useCollection` w web + ekran meczu RPS (na pełnym JWT) + ekran wyniku (dane z `match_events`) z rewanżem.
- **Telemetria** (G2) od pierwszego meczu: czasy `/resolve` (percentyle), długości faz, częstość timeoutów/`defaultMove`, rozmiary stanów — dane do kalibracji z `UNKNOWNS.md`.

**Testy do CI.**
- **S2 — Głuchy dev:** mock serwisu rejestruje wszystkie wywołania — żadne nie zawiera ruchu przed sealem; timing acków `ready` stały; **nadpisania ruchu nie generują zdarzeń w kolekcjach subskrybowalnych** (A3).
- Rozszerzenie **S1** na żywej kolekcji `match_views`: konto-szpieg nie widzi cudzego widoku (row-level na realnym change-streamie — domyka też otwarte „do zweryfikowania" z ETAP1 o `$and`).

**Akceptacja.** Zalogowany gracz gra RPS z drugim graczem przez web; wynik i rewanż działają; `match_views` zwraca wyłącznie własny widok.

---

## 2d — Pokoje przez link + goście + handoff + tokeny meczu

**Cel.** Domknąć przepływ wejścia do gry: pokój przez link (także dla gościa), handoff do aplikacji gry i scoped token meczu. Bramka końcowa Etapu 2.

**Deliverables.**
- `rooms`: tworzenie, kod/link `/r/AB3X` (6 znaków, TTL 24 h), visibility (publiczny na liście / prywatny przez kod), dołączanie — w tym **gość** z sesją gościa z Etapu 1 (nick tymczasowy, mecz towarzyski).
- **Kody handoff** (jednorazowe, 60 s) + **tokeny meczu** (scoped) — pełne wiązanie z `matches`/`registrations` (funkcje zescaffoldowane w Etapie 1). Handoff → wymiana na token meczu → aplikacja gry.
- `submit-move` / `reveal-done` przyjmowane **tokenem meczu** danego gracza; walidacja zakresu (token nie otwiera nic poza swoim meczem).
- Aplikacja UI RPS jako osobny artefakt deva (redirect; **jeszcze nie** zaufany bundle z CSP — to Etap 4), powrót do web z wynikiem.

**Testy do CI.**
- Token meczu: subskrypcja/akcja poza własnym meczem odrzucona.
- Gość: dołączenie przez link, mecz towarzyski bez wpisów ELO/rankingu.
- **S3 (podstawowy)** na aplikacji deva: próby eksfiltracji przez kanały danych i nawigacyjne (`fetch`, WS, WebRTC, beacon, `location=`, `form-action`, `<a ping>`, prefetch) — pełna wersja na zaufanym hostingu bundli w Etapie 4 (D1).

**Akceptacja.** **Dwóch ludzi gra RPS z telefonów przez link** (bramka Etapu 2); gość gra mecz towarzyski przez link; handoff → token meczu → aplikacja → powrót z wynikiem działa.

---

## 2e — Hartowanie i pomiar

**Cel.** Udowodnić odporność awaryjną na żywym RPS i zmierzyć wolumen streamów przed wejściem w matchmaking (Etap 3).

**Deliverables.**
- Pełna walidacja `Paused`/`Cancelled`/rozłączeń na realnym RPS: wyłączenie serwisu RPS w trakcie rundy → `Paused` → powrót → mecz dograny; restart games w trakcie → mecz dograny; rozłączony przez 2 rundy w rankingowym → walkower (reguła K).
- `$match` po kolekcji w pipeline change-streamu + indeks subskrypcji `kolekcja → tickets` (B4).
- Retencja `resolve_log` (E2): pełny log przez X dni, potem próbka + wpisy powiązane z otwartymi `audit_cases`; parametry w konfigu.
- Przegląd telemetrii z 2c pod kątem kalibracji (budżet `/resolve`, długości faz).

**Testy do CI / pomiar.**
- Odporność: fixture wyłączający serwis RPS w trakcie rundy → mecz dograny po powrocie.
- **Benchmark** (bramka przed Etapem 3): np. 200 równoległych meczów RPS na dev-maszynie bez zadyszki (CPU dopasowywania streamów).

**Akceptacja.** Scenariusze awaryjne dograją mecz; benchmark w założonym progu; parametry retencji i budżetów w konfiguracji.

---

## Uwagi przekrojowe

- **Liczby to konfiguracja.** Wszystkie progi/budżety/backoffy są parametrami od dnia 1 — 2e tylko zbiera dane do kalibracji (Etap 5+).
- **Co świadomie NIE wchodzi w Etap 2:** zaufany hosting bundli UI z CSP + subdomena per gra (Etap 4), ELO i społeczność (Etap 4), `trust_events`/`judge`/pipeline rejestracji (Etap 5), arrowsoccer (Etap 6). RPS w Etapie 2 jest wzorcem ścieżki „zdalny serwis + aplikacja po redirect"; wersję na zaufanym bundlu dostaje w Etapie 4.
- **Kolejność jest twarda:** 2b zależy od maszyny stanów z 2a; 2c od SDK z 2b; 2d od działającego meczu z 2c; 2e hartuje całość. Wyjątek: telemetria (2c) i definicje budżetów (2b/C2) warto wpiąć wcześnie, bo zasilają kalibrację.
