# sixseven — przegląd strategiczny (uwagi drugiego rzędu)

> Uwagi do planu (`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`) celowo **poza** zakresem `IMPLEMENTATION_RISKS.md`. Tamten dokument pokrywa „co wybuchnie w kodzie"; ten patrzy na kolejność etapów, ekonomię platformy i koszty przerzucane na deweloperów. Format jak w ryzykach: **problem → wytyczna**, z etapem i oznaczeniem ⚠ dla wpisów wymagających poprawki w istniejących dokumentach.
>
> Kontekst oceny: projekt jest dojrzały. „Sekret jest walutą", `trust_events` jako jedyne źródło prawdy, rozdzielenie targetingu (AI wolno) od werdyktów (tylko dowód deterministyczny), odrzucenie wabików z uzasadnieniem — to decyzje seniorskie. Poniższe uwagi są drugiego rzędu.

## Najważniejsze (przeczytaj choćby tylko to)

1. **P1** — gospodarka zaufania (`judge`, renoma, sprawdzalność, pułapki) powstaje w MVP, a wartość dostarcza dopiero wobec obcych devów, których jeszcze nie ma. Jedyna uwaga, przy której warto się zatrzymać przed kodem.
2. **P2/P3** — determinizm w wire contract międzyjęzykowym jest trudniejszy niż dokument przyznaje (nie tylko `Math.*` w JS — też serializacja liczb w JSON), a kara za jego złamanie uderzy w uczciwych devów. Do dopisania w ryzykach przed etapem 2.
3. **P4** — sprawdzalność bramkuje przywileje od dnia 1 i jest ogrywalna tanim Sybilem.

## P1. Policja dwustronnego rynku przed istnieniem którejkolwiek strony ⚠

**Problem:** Cała gospodarka zaufania — `judge`, renoma, sprawdzalność, pułapki, testy lustrzane, targeting AI — ma sens wyłącznie wobec **niezaufanych, obcych** deweloperów. Wszystkie trzy gry startowe (RPS, snajperzy, arrowsoccer) są first-party. Dla nich silnik zaufania daje zero wartości — ufamy sobie. Dogfooding przez self-service (snajperzy) dowodzi, że *pipeline rejestracji działa*, ale nie że *detekcja łapie prawdziwego oszusta* — bo oszusta nie ma. Etap 5 to potężny kawał inżynierii wbudowany pod niepotwierdzony popyt: najtrudniejszy podsystem powstaje najwcześniej, a wartość dostarcza najpóźniej.

**Wytyczna:** rozważyć przesunięcie `judge` + formuł + progów **za** MVP, gated na zdarzenie „pojawił się drugi, obcy deweloper". MVP dowozi rozgrywkę, handoff, matchmaking i społeczność. Fixtury bezpieczeństwa (S4/S5) i sam schemat `trust_events` mogą powstać wcześniej jako szkielet, ale mikroserwis audytowy, harmonogram i warstwa AI czekają na realnego adresata. Decyzja świadoma i jawna — jeśli zostaje w MVP, warto zapisać uzasadnienie („chcemy mieć system gotowy w dniu wejścia pierwszego obcego deva, nie budować go pod presją"). *(decyzja przed etapem 5)*

## P2. Determinizm międzyjęzykowy jest trudniejszy niż zakłada kontrakt ⚠

**Problem:** `IMPLEMENTATION_RISKS.md` łapie F1/F2 (transcendentalia, kolejność iteracji), ale wyłącznie dla fizyki arrowsoccera w JS. Wire contract obiecuje determinizm **dowolnemu językowi**. Deweloper w Pythonie (kolejność `dict`, numpy), Go (iteracja po mapie), Javie złamie replay-audyt bez złej woli. Tabela kar traktuje „replay niezgodny" jako −15 renomy — ta sama ranga co „podmiana logiki". To odstraszy dokładnie tych indie devów, których platforma chce.

**Wytyczna:** (a) rozdzielić w tabeli zdarzeń „chwiejny determinizm" (ostrzeżenie + pomoc, mała lub zerowa kara na renomie, dodatnia sprawdzalność) od „podmiany logiki" (pełna kara) — inaczej penalizujemy najtrudniejszy problem platformy jak przestępstwo; (b) uczynić SDK z certyfikowaną ścieżką (fixed-point math, kanoniczna serializacja) **jedyną** sankcjonowaną drogą do determinizmu, zamiast wymagać od deva, by sam trafił w byte-identyczność na ślepo. *(etap 2 — wire contract i tabela kar; dopisać do IMPLEMENTATION_RISKS.md)*

## P3. Serializacja liczb w JSON to mina data-integrity na poziomie wire ⚠

**Problem:** Stan lata platforma→dev→platforma jako JSON co rundę. JSON nie reprezentuje `int64` powyżej 2^53, gubi `-0`, nie ma `NaN`/`Infinity`. Gra ze stanem zawierającym duże liczby całkowite albo floaty dostanie ciche mutacje przy każdym round-tripie przez zapis platformy → rozjazd replay i fałszywe pozytywy audytu. F2 w ryzykach dotyczy tylko arrowsoccera.

**Wytyczna:** jawna specyfikacja **kanonicznego kodowania w samym wire contract**: dozwolone typy liczbowe i ich zakresy, zakaz/obsługa wartości specjalnych, deterministyczna serializacja (sortowanie kluczy, reprezentacja liczb). Walidacja round-tripu w harnessie kontrakt-testów: `state == decode(encode(state))` bajt w bajt. *(etap 2 — dopisać do IMPLEMENTATION_RISKS.md, obok C-serii)*

## P4. Sprawdzalność bramkuje przywileje od dnia 1 i jest ogrywalna

**Problem:** Anti-farming waży mecze „unikalnością i niezależnością graczy" (IP, wiek konta, grafy). To dokładnie sygnały, które zmotywowany dev kupuje: proxy rezydencjalne, postarzane konta, szeroki graf krzyżowy. Nagroda za wysoką sprawdzalność (auto-publish, rzadsze audyty, ×5 meczów równoległych) to jest to, czego chce zły aktor. Plan mówi „wersja naiwna w etapie 5, iteracje później" — ale odblokowania przywilejów wiszą na tej ogrywalnej metryce natychmiast.

**Wytyczna:** sprawdzalność liczona twardziej tylko z realnych meczów rankingowych (mają historię ELO i behawioralną); nowe i syntetyczne konta ważone bliżej zera niż „1/n". Progi otwierające najbardziej kosztowne przywileje (auto-publish, rzadsze audyty) wymagają dodatkowo minimalnej liczby *rankingowych* meczów z niepowiązanymi kontami, nie samej sumy wag. *(etap 5, ale zaprojektować progi z tą świadomością od początku)*

## P5. Redirect na obcy origin co mecz — koszt UX i trenowanie pod phishing

**Problem:** Każde wejście w mecz to pełne przekierowanie do zewnętrznej aplikacji i powrót. To (a) szarpany flow, (b) warunkowanie użytkownika do nawyku „platforma wysyła mnie na losową domenę, której mam zaufać". Regulaminowe „gra nigdy nie prosi o hasło" nie odczaruje behawioralnego treningu. Dla ranked hostujemy bundle (dobrze), ale casual śle ludzi na dowolny origin deva.

**Wytyczna:** rozważyć podniesienie priorytetu odłożonego „osadzenia aplikacji gry w slocie `default`" (cross-origin iframe) — może być właśnie tym, co czyni z tego *platformę*, a nie katalog linków. Minimum: spójny, rozpoznawalny ekran przejścia „wchodzisz do gry X deva Y" po stronie platformy przed każdym redirectem, żeby użytkownik uczył się origin gry jako oczekiwanego, nie losowego. *(rozważyć w etapie 4, przy pierwszym bundlu i pierwszym self-hosted UI)*

## P6. Audyty przerzucają koszt compute na deweloperów

**Problem:** Replay, lustro, health-checki i pułapki wołają serwis deva. Nowy dev o niskim zaufaniu (5% replay + 2% lustro + pułapka co tydzień) płaci **własną infrą** za podejrzliwość platformy. Dla hobbysty to realny deterrent wejścia.

**Wytyczna:** nazwać koszt wprost w `GAME_DEV_GUIDE.md` (dev wie, ile ruchu audytowego go czeka) i rozważyć limit kosztu audytu jako ułamek ruchu produkcyjnego danej gry — audyt nie powinien wielokrotnie przewyższać realnego obciążenia meczami. *(etap 5)*

## P7. Dziedziczenie renomy konta chłodzi eksperymentowanie

**Problem:** „Wzorce naruszeń obciążają wszystkie gry deva" to dobra broń anty-reset, ale w połączeniu z surową karą za niedeterminizm (P2) oznacza, że eksperymentalna druga gra z bugiem floatowym ciągnie w dół sprawdzony flagowiec. Efekt mrożący na eksperymenty — dokładnie odwrotnie do tego, czego platforma chce od devów.

**Wytyczna:** flaga „beta/piaskownica" dla nowej gry: gra oznaczona jako eksperymentalna nie obciąża renomy konta (i nie dziedziczy bonusu sprawdzalności), dopóki nie „ukończy studiów" — przejdzie próg dojrzałości i deweloper świadomie ją promuje do pełnego statusu. *(etap 5)*

## P8. Interakcja A1 × C3 przy rehydracji jest niedodefiniowana ⚠

**Problem:** A1 (z ryzyk): runda `sealed` po crashu → ponowny `/resolve` z tymi samymi ruchami (bezpieczne, bo determinizm). C3 (z ryzyk): żądanie niesie wersję manifestu. Jeśli mecz zapieczętował rundę pod v1, a do rehydracji dev wdrożył v2 i v1 już nie działa — zapieczętowanej rundy nie da się wiernie rozstrzygnąć. To obowiązek cięższy niż deklarowane „przyjmij starszy stan": dev musi trzymać **uruchamialne** stare wersje logiki dla każdego meczu w locie.

**Wytyczna:** zapisać jako twardy wymóg kontraktu: deweloper gwarantuje uruchamialność każdej wersji manifestu, pod którą istnieje niezakończony mecz. Platforma pinuje wersję w `matches`/`resolve_log` (już wynika z C3) i honoruje pin przy rehydracji sealed-rundy. Alternatywa awaryjna do rozważenia: jeśli wersja jest niedostępna, mecz idzie w `Cancelled` bez zmian ELO, nie w niespójne rozstrzygnięcie. *(etap 2 wire contract + etap 5 judge — dopisać do C3 w IMPLEMENTATION_RISKS.md)*

## Rekomendowane naniesienia w istniejących dokumentach

| Dokument | Zmiana | Wpis |
|---|---|---|
| `IMPLEMENTATION_RISKS.md` | wire contract: kanoniczne kodowanie liczb i round-trip w harnessie (nie tylko arrowsoccer) | P3 |
| `IMPLEMENTATION_RISKS.md` | tabela kar: rozdzielić „chwiejny determinizm" od „podmiany logiki" | P2 |
| `IMPLEMENTATION_RISKS.md` (C3) | dev gwarantuje uruchamialność wersji dla meczów w locie; fallback Cancelled przy braku wersji | P8 |
| `IMPLEMENTATION_PLAN.md` | decyzja o miejscu `judge`/gospodarki zaufania względem MVP (uzasadnienie kolejności) | P1 |
| `IMPLEMENTATION_PLAN.md` | progi przywilejów: minimum meczów rankingowych z niepowiązanymi kontami, nie sama suma wag | P4 |
| `GAME_DEV_GUIDE.md` | jawny koszt audytu ponoszony przez deva + ewentualny limit jako ułamek ruchu | P6 |
| `IMPLEMENTATION_PLAN.md` | flaga „beta/piaskownica" gry nieobciążająca renomy konta | P7 |
| `ARCHITECTURE.md` | podniesienie rangi „osadzenia w slocie `default`" / ekran przejścia przed redirectem | P5 |
