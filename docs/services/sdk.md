# sdk — kontrakt gry jako produkt

## Rola

`@sixseven/sdk` to interfejs między platformą a deweloperami — i **produkt sam w sobie**: od jego jakości zależy, czy ktokolwiek zbuduje grę na sixseven. Obejmuje typy kontraktu, wire contract (spec HTTP), adapter `serve`, harness testów (ten sam lokalnie i przy rejestracji — to obietnica DX #1), CLI i scaffold projektu. Pełne DX opisuje `GAME_DEV_GUIDE.md` — ten dokument to strona implementacyjna.

## Składniki

- **Typy kontraktu:** `GameDefinition<State, Move, View, Data, Prefs, Options>` (init z playerData+options, validateMove, defaultMove z rng, resolve z revealDurationMs, isFinished, viewFor, annotate z grant/revoke), typy manifestu (badges, options: presets+fields, planningPhaseMs ≥ 2000; do dodania przy implementacji judge: deklaracja symetrii gry).
- **Wire contract (spec + implementacja):** `POST /init`, `/resolve` (zbatchowany: stan + surowe ruchy + spóźnieni → stan, punkty, events, views, finished, revealDurationMs), `/annotate`, `/health`; podpisy HMAC + timestamp ± 30 s; limity rozmiaru; **brak** `/validate-move` w fazie planowania (safe secret — walidacja gry wewnątrz `/resolve`). Wersjonowany (`{v}` w kopercie) od dnia 1.
- **`serve`:** adapter GameDefinition → serwis HTTP (weryfikacja podpisów, walidacja ruchów przez `validateMove` + podstawianie `defaultMove`, obsługa spóźnionych, mapowanie błędów). Tryb `--dev` bez podpisów.
- **Harness testów (`sixseven-sdk test <url>`):** zgodność manifestu, determinizm (podwójne wywołania), fuzzing ruchów, limity czasu, serializacja stanu, leak w views, poprawność defaultMove i annotate. Dokładnie ten sam pakiet uruchamia registry przy rejestracji i judge okresowo.
- **CLI:** `login`, `register --logic --app`, `status`, `publish-ui` (upload bundle → hosting z CSP), `serve --dev`, `test`, *(później)* `play` (lokalny runner bez platformy).
- **Scaffold:** `npm create @sixseven/game` (struktura z `GAME_DEV_GUIDE.md`).
- **`@sixseven/sdk/math`:** deterministyczne helpery (wektory, sqrt, funkcje trygonometryczne o gwarantowanym wyniku, `Rng` seedowany) — warunek modelu „UI odtwarza symulację lokalnie".

## Czego nie robi

Nie zawiera niczego wykonywanego przez platformę w runtime meczu (platforma ma własną implementację wire contract po stronie klienta w games) — SDK jest dla devów. Nie ukrywa wire contract: dokumentowany jawnie, żeby inne języki były pełnoprawne.

## Specyfika i ryzyka

**Kontrakt jest najdroższą rzeczą do zmiany w całym projekcie** — każda korekta po pojawieniu się zewnętrznych devów to migracja ekosystemu. Stąd: wersjonowana koperta, druga gra (snajperzy) i trzecia (arrowsoccer) budowane przed otwarciem rejestracji jako test generyczności, zmiany kontraktu wyłącznie addytywne po etapie 5. Determinizm helpers math wymaga testów cross-środowiskowych (Node serwera deva vs przeglądarki graczy).

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Pakiet typów + spec wire contract (dokument w repo SDK) + koperta z wersją | 2 |
| 2 | `serve` + moduł podpisów + `test` (harness minimalny: manifest, determinizm, fuzzing, leak) | 2 |
| 3 | Scaffold `npm create @sixseven/game` (szablon = RPS z przewodnika) | 2 |
| 4 | `login` + `publish-ui` (z hostingiem bundli CSP po stronie platformy) | 4 |
| 5 | `register`/`status` przeciw pipeline registry; harness rozszerzony o limity czasu i annotate | 5 |
| 6 | `math` (wektory, trig, Rng) z testami cross-środowiskowymi; wsparcie dla współdzielonego modułu symulacji | 5–6 (przed arrowsoccer) |
| 7 | `play` — lokalny runner | później |

**Kryterium „zrobione" dla rdzenia:** RPS z przewodnika działa przez `serve` + przechodzi `test` lokalnie i ten sam harness w registry bez różnic w wyniku (obietnica „lokalnie = serwerowo" zweryfikowana testem CI).

## Niewiedza lokalna

Deklaracja symetrii gry w manifeście (kształt — razem z judge); dystrybucja SDK dla innych języków (na start: tylko spec wire contract + przykłady); zakres `play` (terminal vs przeglądarka).
