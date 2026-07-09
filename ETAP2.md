# Etap 2 — status wykonania (handoff)

> Silnik meczu + pierwszy sekret end-to-end (RPS). Podetapy wg `docs/ETAP2_PLAN.md`.
> Stan na teraz: **2a ✅, 2b ✅, 2c prawie (backend ✅ + gate proxy ✅; został ekran web)**, 2d/2e nietknięte.
> Ten plik = co zrobione, jak zweryfikować, co dalej, i na co uważać.

## Gdzie jesteśmy

| Podetap | Zakres | Stan |
|---|---|---|
| 2a | Silnik: maszyna stanów + kolekcje prywatne + pętla deadline'ów, fake-serwis | ✅ zielone (unit + integracyjne) |
| 2b | Wire contract + SDK (`serve` + harness `test`) + SSRF (C1) | ✅ zielone |
| 2c | RPS jako zdalny serwis + silnik e2e | 🟡 backend ✅ + gate proxy ✅; **brak: ekran web** |
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

## Jak uruchomić testy

**Bez bazy (jednostkowe):**
```
npm test --workspace packages/sdk        # serve + harness + init
npm test --workspace games               # maszyna stanów, ssrf, command-api
npm test --workspace catalog/rps         # kontrakt RPS
npm test --workspace packages/hmac
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

## Następny krok — dokończyć 2c

1. ~~**Gate proxy (backend)**~~ ✅ zrobione (patrz „2c gate proxy" wyżej). Subskrypcja stanu (`matches`/`match_views`) już działa z Etapu 1 (polityki row-level).
2. **Ekran web (frontend, Vue/hydra):** `useCollection` (subskrypcja) + ekran meczu RPS (składanie ruchu, reveal) + ekran wyniku z rewanżem. Ustalony zakres: **dopracowany, z animacjami reveal** (mobile-first, spójny z `UiButton` itd.). Rozważyć skill `front`. Wiąże się z eventami gate: emituje `games:create-match|start|submit-move|reveal-done`, słucha `*-complete`/`*-error`/`submit-move-rejected`; stan przez subskrypcję `matches`/`match_views`.
3. **Testy akceptacji 2c:** S2 (mock głuchego deva — częściowo w e2e 2a), rozszerzenie S1 na żywe `match_views`, „zalogowany gracz gra RPS przez web".

Reszta Etapu 2: 2d (pokoje/link/goście/handoff/tokeny meczu — tu wchodzi też implementacja wielotokenowych sesji w gate), 2e (hartowanie Paused/Cancelled na żywym RPS + benchmark 200 równoległych meczów przed Etapem 3).
