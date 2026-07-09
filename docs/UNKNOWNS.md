# sixseven — rejestr niewiedzy

Skonsolidowana lista rzeczy, których świadomie jeszcze nie wiemy. Zasada: niewiedza jest zapisana, ma kontekst i moment rozstrzygnięcia — nie jest ukryta w głowach. Gdy pytanie zostaje rozstrzygnięte, wpis przenosi się do decyzji w `ARCHITECTURE.md` lub odpowiedniego dokumentu.

## Do rozstrzygnięcia w konkretnym etapie

| Pytanie | Kontekst | Kiedy |
|---|---|---|
| Budżety czasu odpowiedzi serwisów gier (2 s na `/resolve` to strzał) i dokładna polityka pauzy/anulowania | do zgrania z `revealDuration` i realną siecią | etap 2 (pomiar na RPS) |
| Responsywność mobilna: web hydry nie ma ani jednego breakpointu — ile mobile'u w MVP? | katalog/lobby/czat muszą działać na telefonie; pełny mobile to realna praca | etap 3 |
| Kalibracja liczb zaufania (progi przywilejów, wagi zdarzeń, tempo odbudowy renomy) | wartości startowe w `IMPLEMENTATION_PLAN.md`; są konfiguracją | etap 5+ (dane z produkcji) |
| Heurystyka „graczy powiązanych" (wagi sprawdzalności, anti-farming) | IP, wiek konta, grafy wspólnych meczów; wersja naiwna najpierw | etap 5, iteracje później |
| Wybór i konfiguracja AI w judge (tryby assist/auto): jaki model, jakie sygnały wejściowe, jakie limity budżetu | AI wybiera cele, nigdy nie ferruje wyroków — to stałe; reszta otwarta | po stabilizacji sygnałów (etap 5+) |
| Okna i progi matchmakingu ELO (±100, +50/10 s, max 400) | strzały; zależą od wielkości puli graczy | etap 4–5 (playtesty) |

## Otwarte bez terminu (po MVP)

| Pytanie | Kontekst |
|---|---|
| Widzowie (spectator) i publiczne replaye | dane są w `match_events`; wymaga polityki „widz nie widzi ruchów w planowaniu" i UI |
| Osadzenie aplikacji gry w slocie `default` web (cross-origin) jako opcja obok fullscreen | UX ciągłości platformy vs prostota redirectu |
| Hosting „managed" logiki gier (bundle w sandboxie) jako łatwiejsza ścieżka wejścia | wraca problem sandboxa; tylko przy realnym popycie |
| Monetyzacja | świadomie nieprojektowana; naturalne haki: progi zaufania, kwoty meczów, wyróżnienia katalogu |
| Czy photos przechodzi na wspólny replica set | dziś osobne mongo bez change streams — dla obrazków wystarcza |
| Skalowanie gate na wiele instancji | dopasowywanie filtrów in-process; `@socket.io/mongo-adapter` jest w zależnościach, fan-out streamów do przemyślenia |
| Pułapki (mecze-kanarki) dla gier zewnętrznych devów | wymagają bota per gra; zachęta: dev dostarcza bota → szybsza sprawdzalność |
| Boty per gra jako feature gracza (trening z botem) | naturalne rozszerzenie botów pułapkowych; osobny kontrakt? |

## Niewiedza per gra

| Pytanie | Gra |
|---|---|
| Wymiary boiska, koła środkowego, zakresy suwaków fizyki | arrowsoccer — playtesty (etap 6) |
| Kolizje w obrębie drużyny: zderzenia czy przenikanie (skłaniamy się: zderzenia) | arrowsoccer |
| Tryb 2v2 (2 graczy × 2 zawodników?) | arrowsoccer — po MVP |
| Pełny game design pojedynku snajperów (mapa, celowanie, widoczność) | snajperzy — przed etapem 5 |
| Pozostałe ślepe zaułki z poprzedniej implementacji (Flash/PHP) arrowsoccera | do wyciągnięcia od Piotra — spisany jest kwant symulacji |

## Zasady utrzymania tego pliku

1. Nowe „nie wiem" trafia tu od razu, z kontekstem i (jeśli się da) terminem.
2. Rozstrzygnięcie = wpis znika stąd i pojawia się jako decyzja z uzasadnieniem w dokumencie właściwym.
3. Liczby-strzały w dokumentach są zawsze oznaczone jako propozycje do kalibracji i mają wpis w tabeli powyżej.
