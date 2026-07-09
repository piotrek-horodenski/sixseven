# Etap 2 — status wykonania (handoff)

> Silnik meczu + pierwszy sekret end-to-end (RPS). Podetapy wg `docs/ETAP2_PLAN.md`.
> Stan na teraz: **2a ✅, 2b ✅, 2c ✅ (backend + gate proxy + ekran web)**, 2d/2e nietknięte.
> Ten plik = co zrobione, jak zweryfikować, co dalej, i na co uważać.

## Gdzie jesteśmy

| Podetap | Zakres | Stan |
|---|---|---|
| 2a | Silnik: maszyna stanów + kolekcje prywatne + pętla deadline'ów, fake-serwis | ✅ zielone (unit + integracyjne) |
| 2b | Wire contract + SDK (`serve` + harness `test`) + SSRF (C1) | ✅ zielone |
| 2c | RPS jako zdalny serwis + silnik e2e + ekran web | ✅ backend + gate proxy + ekran web |
| 2d | Pokoje przez link + goście + handoff + tokeny meczu | ⬜ nietknięte |
| 2e | Hartowanie + benchmark wolumenu streamów | ⬜ nietknięte |

## Co zrobione (z lokalizacją)

**2a — silnik (`games/`):**
- Infra: `app/{logger,settings,db}.ts`. Settings ma parametry silnika (budżet/backoff resolve, retencja `resolve_log`, interwał schedulera, `RESOLVE_ALLOW_PRIVATE`, `INTERNAL_SECRET`).
- 7+1 schematów w `app/models/`: `matches`, `match_views`, `match_events` (subskrybowalne) + `moves`, `match_states`, `resolve_log`, `player_memory`, `registrations` (prywatne, `exposed:false`). Rejestr w `models/index.ts`.
- Czysta maszyna stanów: `app/engine/state-machine.ts` (bez DB/IO — zwraca `{next, effect, changed}`; idempotencja przez `changed:false`). Pełne unit-testy: `tests/engine/state-machine.test.ts`.
- Engine: `app/engine/engine.ts` — `submitMove` (pisze tylko do `moves`, I1/A3), `closePhase` (atomowe `sealed` PRZED `/resolve`, A1), `resolveOnce` (retry przez scheduler, A4; `attemptSeq` monotoniczny do `resolve_log`), `applyResult` (transakcja multi-dok, A2), `revealDone`, `resume`, `cancel`. Telemetria G2 w `resolveOnce`.
- Scheduler: `app/engine/scheduler.ts` — jedna pętla po `matches.deadline` (A5), guard `ticking`.
- resolve-client: `app/engine/resolve-client.ts` — podpis HMAC per próba, wersja manifestu (C3), budżet/timeout, limit rozmiaru, zakaz redirectów, SSRF. **`GameServiceEndpoint.url` = BAZOWY URL** (klient dokleja `/resolve`, `/init` przez `gameUrl()`).
- Fake-serwis: `tests/helpers/fake-game-service.ts`. Testy integracyjne: `tests/integration/engine.integration.test.ts` (I1–I5, retry→pause→resume, atomowość).

**2b — SDK (`packages/sdk/`):**
- `src/contract.ts` — kanoniczne typy wire + `GameManifest` + interfejs `GameDefinition` (init, validateMove, defaultMove, resolve) + `InitRequest/InitResponse`.
- `src/serve.ts` — `handleResolve`/`handleInit` (czyste rdzenie: HMAC, limit, walidacja, `validateMove`→`defaultMove` z flagą `defaulted`), `resolvePipeline` (współdzielony), `serve()` (HTTP `/resolve`, `/init`, `/health`).
- `src/harness.ts` — `runContractTests` (determinizm, determinizm po JSON round-trip, schemat, `planningPhaseMs≥2000`).
- `src/cli.ts` — `sixseven-sdk serve|test <moduł>`.
- Testy: `tests/{serve,harness}.test.ts` + fixtury `tests/fixtures/games.ts` (poprawny RPS + niedeterministyczny + poza-schematem).
- SSRF (C1) w games: `games/app/engine/ssrf.ts` (`isBlockedIp`, `assertAllowedUrl`), wpięte w resolve-client i init-client. Test `games/tests/ssrf.test.ts`. Furtka `allowPrivate` (dev/test). Wyjaśnienie `169.254.169.254` w `docs/IMPLEMENTATION_RISKS.md` (C1).

**2c backend:**
- Rejestracja: `games/app/models/registrations.schema.ts` + `app/services/register-game.ts` (`registerGame`, `createRegistrationResolver`). Wpięte w `app/app.ts` (resolver zamiast stubu).
- RPS jako pierwsza gra first-party: **nowy workspace `catalog/rps/`** (dodane `catalog/*` do root `workspaces`). `src/rps.ts` (best-of-N, deterministyczny), `src/index.ts` (`serve` + `require.main` guard), `tests/rps.contract.test.ts`.
- `/init`: SDK `serve` + `games/app/engine/init-client.ts`.
- Command API: `games/app/command-api.ts` — router HTTP komend (`create-match` [init→createMatch], `start`, `submit-move`, `reveal-done`), auth wewnętrzny (`x-sixseven-internal`, stały czas), w pełni wstrzykiwalny. Test bez bazy: `games/tests/command-api.test.ts`. Wpięte w `app.ts` pod `/command`.
- e2e: `games/tests/integration/rps-e2e.integration.test.ts` — silnik ↔ prawdziwy RPS (SDK `serve`) po HTTP+HMAC, przez rejestrację; + test `callInit` po HTTP.

**2c gate proxy (backend, tej sesji):**
- Klient HTTP gate→games: `gate/app/services/games-client.ts` — wstrzykiwalny (`fetchImpl`), POST do `GAMES_URL/command/*` z nagłówkiem `x-sixseven-internal`, budżet czasu (AbortController), `redirect:'error'`. Mapowanie statusów: submit-move 200→`accepted`, 409→`rejected` (normalny wynik gry, nie błąd), reszta→błąd; sieć→`status:0` „games unreachable".
- Socket-handlery: `gate/app/socket-handlers/games/` — `games:create-match|start|submit-move|reveal-done`. **`playerId` ZAWSZE z `socket.user._id` (JWT), nigdy z payloadu** (submit-move ignoruje `payload.playerId`). create-match dokleja twórcę do listy graczy (2c bez pokoi/matchmakingu). Acki: `*-complete` / `*-error` / `submit-move-rejected`. Goście (`socket.guest`) jeszcze nie grają — wymagany `socket.user`. Klient inicjalizowany **leniwie** (bez efektu ubocznego env przy imporcie barrela). Rejestr w `socket-handlers/index.ts`.
- Env: `GAMES_URL` (bazowy URL games, domyślnie `http://localhost:4120`) + `INTERNAL_SECRET` (musi = games) w `gate/app/settings.service.ts` + `.env.example` (root i gate). games nie jest jeszcze w `docker-compose` — na razie dev lokalny.
- Testy (bez sieci/bazy): `gate/tests/handlers/games.test.ts` (fake-klient: guardy, mapowanie playerId, acki, rejected, błędy) + `gate/tests/services/games-client.test.ts` (fake-fetch: nagłówek, ścieżki, mapowanie statusów). Logika zweryfikowana też runtime (strip-types) w sandboxie; **pełne testy odpala Piotr lokalnie**.

**2c ekran web (`web/`, tej sesji):**
- `useCollection` (`src/composables/useCollection.ts`) — reużywalna subskrypcja jednej kolekcji (subscribe + `collection-*` + reconnect + cleanup), wyciągnięta ze wzorca color-presets. Rejestracja idempotentna (`off` przed `on`).
- Store meczu: `src/stores/games/{games.model.ts,games.store.ts}` — subskrypcja `matches` + `match_views` (dwa `useCollection`), emisja komend `games:*`, nasłuch acków (`*-complete`/`*-error`/`submit-move-rejected`, tylko UX). Gettery: `activeMatches`/`finishedMatches`, `matchById`, `latestView`, `opponentId`. Subskrypcja startuje w `AppLayout` (jak color-presets), nie per-route → brak wyścigu mount/unmount `/play` ↔ `/play/:id`.
- Moduł `src/modules/games/`: `GamesView` (lobby: lista meczów gracza + formularz „nowy mecz" po `userId` przeciwnika — 2c bez matchmakingu), `MatchView` + `RpsBoard` (lobby/planning/resolving/revealing/finished/paused/cancelled), `RpsHand`, `MatchCard`, `CreateMatchForm`. Planning: odliczanie z `matches.deadline` + wybór ruchu + `ready` przeciwnika; reveal: animacja odsłonięcia obu rąk + werdykt, po `REVEAL_MS` emit `reveal-done` (idempotentnie, raz na rundę); finished: wynik + rewanż. Mobile-first, styl `src/styles/modules/games.scss`, ikony w `font-awesome.config.ts`.
- Trasa `/play` (+ `/play/:id`) w `router/routes/games.route.ts`, pozycja „Graj" w `MainMenu`.
- **Backend (konieczne dla frontu):** dodana brakująca polityka subskrypcji `matches` w `gate/app/subscriptions/policies.ts` — row-level `{ players: user._id }` (członkostwo w tablicy; `match_views` była, `matches` NIE). Zweryfikowane w realnym silniku `query` (protobi/query): `{players:self}` dopasowuje po członkostwie, a `$and` ze spoofem klienta daje pustkę. `matches` nie zawiera treści ruchów (te w prywatnej `moves`), więc bez sanityzacji. Wariant „mecz publiczny z okrojonymi polami" świadomie odłożony do 2d. Test dopisany w `gate/tests/subscriptions/policies.test.ts`.
- Testy web (odpala Piotr): `web/src/composables/__tests__/useCollection.test.ts`, `web/src/stores/games/__tests__/games.store.test.ts`.

## Jak uruchomić testy

**Bez bazy (jednostkowe):**
```
npm test --workspace packages/sdk        # serve + harness + init
npm test --workspace games               # maszyna stanów, ssrf, command-api
npm test --workspace catalog/rps         # kontrakt RPS
npm test --workspace packages/hmac
npm test --workspace gate                 # m.in. polityki subskrypcji (matches/match_views)
npm test --workspace web                  # useCollection + games store (wymaga linuksowego rollup — patrz pułapki)
```

**Integracyjne games (wymagają replica setu — transakcje A2):**
```
docker run -d --name games-test-mongo -p 27140:27140 mongo:latest --replSet rs0 --port 27140 --bind_ip_all
# odczekaj 3–5 s, potem:
docker exec games-test-mongo mongosh --port 27140 --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27140'}]})"
npm run test:integration --workspace games
```
Sprzątanie: `docker rm -f games-test-mongo`. Config celuje w `mongodb://localhost:27140/games_test?replicaSet=rs0` (`games/vitest.integration.config.ts`).

## Decyzje podjęte w tej sesji (i gdzie udokumentowane)

- **Model sesji: wielotokenowy (minimalny)** — `users.token` → `users.sessions[]`. `ARCHITECTURE.md` → „Model sesji", odzwierciedlone w `IMPLEMENTATION_PLAN.md` (tabela tokenów), `UNKNOWNS.md` (usunięte), `ETAP1.md`. **Jeszcze NIE zaimplementowane w gate** — do zrobienia przy tokenach (2d).
- **Poprawki ryzyk naniesione do planu** (tabela w `IMPLEMENTATION_RISKS.md`, wszystkie ✓): A1 sealed, A2 atomowość, A3 (S2), C3 wersja w `/resolve`, D1 (S3), F1/F3 (arrowsoccer). A4/A2 też w maszynie stanów.
- **Retry/backoff przez scheduler** (deadline w dokumencie), nie blokujący `sleep`.
- **`GameServiceEndpoint.url` = bazowy URL**, klient dokleja ścieżkę.
- **Pakiety źródło-only** (`sixseven-hmac`, `sixseven-sdk`) — bez `dist/`. W testach rozwiązywane przez **alias vitest** do źródła (patrz configi w `packages/sdk`, `catalog/rps`, `games/vitest.integration.config.ts`). PRZED realnym deployem serwisów trzeba je zbudować do `dist/` albo dać `exports` na źródło.

## Na co uważać (pułapki środowiska)

- **Sandbox Claude nie odpali testów** — `node_modules` są pod Windows (brak linuksowych binariów rollup/esbuild), a rejestr npm zablokowany (403). Wszystkie testy odpala **Piotr lokalnie**.
- **Transakcje (A2) wymagają replica setu.** 3-węzłowy `h2dbs` z `docker-compose` NIE nadaje się do testów z hosta (primary pod wewnętrzną nazwą docker). Używamy jednorazowego 1-węzłowego RS na 27140 (patrz wyżej).
- **Docker „port already allocated"** po nieudanym `run`: zdarza się zawieszona rezerwacja portu; pomaga inny port lub restart Docker Desktp.
- **Git: commituje wyłącznie Piotr.** Claude nie robi żadnych operacji git.
- Nowe zależności/workspace'y (np. `catalog/rps`) → `npm install` przed testami.

## Następny krok — 2c domknięte, pozostały testy akceptacji + 2d

1. ~~**Gate proxy (backend)**~~ ✅ · ~~**Ekran web**~~ ✅ (patrz „2c ekran web" wyżej).
2. **Do sprawdzenia lokalnie przez Piotra:** odpalić `npm test --workspace gate` i `--workspace web` (te ostatnie wymagają linuksowego rollup — sandbox Claude ich nie odpalił). Ręczny happy-path: dwóch zalogowanych graczy, jeden tworzy mecz podając `userId` drugiego, obaj widzą go na `/play`, start → runda → reveal → wynik → rewanż.
3. **Testy akceptacji 2c:** S2 (mock głuchego deva — częściowo w e2e 2a), rozszerzenie S1 na żywe `match_views`, „zalogowany gracz gra RPS przez web".
4. **Uwaga do 2d:** ekran zakłada dziś PEŁNY JWT (goście nie grają — jak gate). Doborem graczy jest ręczne `userId` (bez pokoi/linków/handoffu). Wariant „mecz publiczny" w polityce `matches` odłożony.

Reszta Etapu 2: 2d (pokoje/link/goście/handoff/tokeny meczu — tu wchodzi też implementacja wielotokenowych sesji w gate), 2e (hartowanie Paused/Cancelled na żywym RPS + benchmark 200 równoległych meczów przed Etapem 3).
