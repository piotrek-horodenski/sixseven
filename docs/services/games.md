# games — serce platformy

## Rola

Prowadzi wszystko, co jest rozgrywką i jej gospodarką: mecze (silnik tur), matchmaking, rating, adnotacje, pamięć gier o graczach, rejestr gier i agregaty zaufania. W modelu sekretu games jest **skarbcem**: kolekcje prywatne z ruchami i stanem, do których gate w ogóle nie ma wystawki, żyją tutaj; games decyduje, co i kiedy staje się jawne (projekcje `matches`/`match_views`/`match_events`).

## Odpowiedzialności

- **Match Engine:** maszyna stanów meczu (Lobby → Planning → Resolving → Revealing → Finished, + Paused/Cancelled — pełna logika w `IMPLEMENTATION_PLAN.md`), timery faz, przyjmowanie ruchów (walidacja strukturalna, nadpisywanie do deadline), pieczętowanie fazy, orkiestracja `/resolve` (podpisy HMAC, budżet 2 s, retry, pauza), publikacja projekcji, acki reveal, rehydracja po restarcie.
- **Cykl sekretu:** stany 2–4 z planu głównego dzieją się w całości tutaj; `resolve_log` (wejście/wyjście każdego wywołania) jako paliwo audytów judge.
- **Game Registry:** rejestracja gier (manifest, URL-e, sekrety), pipeline walidacji (schemat, kontrakt-testy zdalne, moderacja odznak), wersjonowanie, statusy publikacji, kwoty równoległych meczów.
- **Matchmaking:** kolejka szybkiego meczu (dobór ELO z rozszerzającym się oknem, accept-flow), pokoje (opcje wg schematu z manifestu, kody/linki, visibility).
- **Gospodarka:** ELO per gra (domyślny preset, walkowery), adnotacje (grant/revoke z puli manifestu, sentiment), pamięć gry (`data` z `/annotate`, `prefs` z API tokenem meczu, snapshot do `init`).
- **Trust (strona silnikowa):** emisja `trust_events` z obserwacji produkcyjnych (resolve OK/timeout/schemat, mecze ukończone z wagą unikalności graczy), utrzymanie agregatów renomy/sprawdzalności i egzekucja progów przywilejów.

## Czego nie robi

Nie rozmawia z przeglądarkami (to gate), nie zna reguł gier (deleguje do serwisów logiki), nie wybiera celów audytów ani nie ferruje werdyktów (to judge — games tylko dostarcza `resolve_log` i przyjmuje werdykty jako trust_events).

## Interfejsy

Wejście: HTTP od gate (komendy z tożsamością), HTTP od judge (odczyt wewnętrzny). Wyjście: HTTP → serwisy logiki gier (wire contract, podpisane), Mongo — baza platformy (projekcje, gospodarka) i kolekcje prywatne (`moves`, `match_states`, `player_memory`, `resolve_log`, `registrations`).

## Specyfika i ryzyka

Serwis w całości nowy (w hydrze nie ma odpowiednika). Najtrudniejsze: poprawność maszyny stanów pod awariami (timeouty deva, restart własny, ack-i reveal) — stąd stan meczu w pamięci + zapis po każdym przejściu, a rehydracja jest ścieżką pierwszej klasy, nie wyjątkiem. Drugie ryzyko: dyscyplina projekcji — każda nowa dana publikowana do bazy platformy musi przejść pytanie „czy to nie sekret?" (checklista w code review). Kwoty i limity rozmiaru (stan ≤ 256 KB, events ≤ 64 KB, pamięć ≤ 2×4 KB) egzekwowane na każdej odpowiedzi deva.

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Szkielet serwisu (wzorzec image: katalog, Dockerfile, compose), kolekcje prywatne, moduł HMAC | 2 |
| 2 | Wire contract klient (typy, podpisy, walidacja odpowiedzi schematem + limity, budżet/retry/backoff) | 2 |
| 3 | Match Engine: maszyna stanów + timery + moves (przyjęcie/nadpisanie/pieczęć) + projekcje + `resolve_log` + rehydracja | 2 |
| 4 | Pokój przez link (minimum: create/join/ready), integracja handoff z gate, ekran wyniku (dane) | 2 |
| 5 | Faza Revealing z ackami + Paused/Cancelled z polityką ratingu | 2 |
| 6 | Kolejka szybkiego meczu (FIFO + accept), lista pokoi, kwoty (stała bazowa) | 3 |
| 7 | ELO + walkowery; adnotacje + pamięć gry (`/annotate`, prefs API, snapshot do init) | 4 |
| 8 | Registry self-service: pipeline rejestracji, kontrakt-testy zdalne, moderacja, wersjonowanie | 5 |
| 9 | Trust: `trust_events` (strona silnikowa), agregaty i formuły, progi przywilejów, dobór ELO w kolejce | 5 |

**Kryteria „zrobione" dla rdzenia:** testy S2 (mock serwisu gry nie widzi ruchu przed pieczęcią; stały timing acków) i I1–I5 z planu głównego przechodzą; mecz przeżywa restart games i pauzę serwisu deva.

## Niewiedza lokalna

Budżety czasu (pomiar na RPS, etap 2), heurystyka powiązań graczy do wag sprawdzalności (etap 5, iteracje), strategia batchowania zapisów przy dużej liczbie meczów (Redis dopiero, gdy pomiary każą).
