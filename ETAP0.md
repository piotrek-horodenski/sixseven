# Etap 0 — status wykonania

> Fundament sixseven z hydry: monorepo, wycinka domeny studia, sekrety, reseed ról, fix bugów web. Ten plik = co zrobione, co odkryto, jak zweryfikować i co dalej.

## Zrobione

**Monorepo** (`package.json` z npm workspaces): `gate/`, `web/`, `image/`, `games/` (nowy szkielet), `packages/sdk` (nowy szkielet). Kod przeniesiony z hydry tylko z plików śledzonych w gicie (bez `node_modules`, uploadów, danych Mongo, coverage). `games/` i `packages/sdk` to celowo szkielety — pełny silnik meczu i SDK (`serve`/`test`) powstają w etapie 2.

**Wycinka domeny studia** — usunięte z gate: modele `engines/clusters/concepts/projects/boards/playlists/datasets/studio-presets/environment`, katalogi handlerów `engines/`, `concepts/`, `projects/`, wpisy w `models/index.ts` i `socket-handlers/index.ts`, gating `engines/clusters` w `subscribe.handler.ts`. Usunięte z web: `modules/{engines,concepts,projects}`, `stores/{engines,concepts,projects}`, trasy `engines.route.ts`/`concepts.route.ts` (projects żyły wewnątrz concepts), scss modułów studia, pozycja menu Engines. Katalog `new/` (martwy) nie został przeniesiony.

**Sekrety** — usunięty hardcoded `hydra-dev-secret` z `docker-compose.yml` (gate i image); teraz `${JWT_SECRET}` podstawiany z `.env` (compose przerywa, gdy brak). Dodane `.env.example` (root + gate), skrypt `scripts/gen-secret.js` (`npm run secret:generate` — generuje/rotuje sekret; `secret:print` — tylko wypisuje).

**Reseed ról** — RBAC studia (`ue-*`, grupy `unreal`/`engines`) zastąpione rolami sixseven: `guest` → `player` (`play-games`, `access-images`) → `developer` (`register-games`) → `admin` (pełne + `manage-games`). Uprawnienia gry są bazowe; pełny zestaw (trust, pipeline rejestracji, hosting UI) dochodzi w etapach 4–5. Kolory ról/grup w admin UI zaktualizowane.

**Bugi web** — (1) motyw: `changeMode()` w `layout.store.ts` zapisuje teraz wybór do `localStorage` (wcześniej nigdy nie zapisywał). (2) multi-device: dedupe ticketów subskrypcji jest teraz per-socket (dwa urządzenia tego samego usera zachowują własne tickety); dodana metoda `unsubscribeSocket` sprzątająca tylko jedno urządzenie; `disconnect` i `unsubscribe` wołają ją z `socket.id`. Testy regresyjne dodane w obu obszarach.

## Odkryte (do decyzji)

**Model sesji jest jednotokenowy.** Hydra trzyma pojedyncze pole `user.token` — logowanie na drugim urządzeniu nadpisuje token i unieważnia pierwsze. To osobna, głębsza przyczyna problemu multi-device niż dedupe ticketów (który naprawiłem). Plan (HANDOFF) zakładał brać auth „w całości". **Decyzja Piotra:** czy przejść na model wielotokenowy (lista aktywnych sesji per user) w etapie 1 przy okazji tokenów, czy zostawić jednosesyjność. Poprawka multi-device subskrypcji jest kompletna niezależnie od tej decyzji, ale bez wielotokenowości realny multi-device i tak jest ograniczony przez auth.

## Świadomie odłożone

**Pełne usunięcie `cfg/`.** Plan mówił „cfg/ → .env". Zostawiłem tooling `cfg/` na miejscu (zastąpiony przez `.env.example` + skrypt sekretu), bo wyrwanie go wymaga przepięcia skryptów dev (`dev.sh`, `dev-runner.js`, `operate.sh`) i przetestowania bootu, czego nie dało się zweryfikować w tej sesji (patrz niżej). Do domknięcia na maszynie z działającym stackiem.

## Weryfikacja — WYMAGA uruchomienia u Ciebie

Bramki akceptacji etapu 0 **nie zweryfikowałem wykonaniem** — sandbox tej sesji blokuje rejestr npm (403), więc nie zainstalowałem zależności ani nie odpaliłem testów/bootu. Zweryfikowane statycznie: brak zawisłych importów do usuniętych modułów (gate + web, źródło i testy), wszystkie `package.json` parsują się, testy studia usunięte lub przepięte na ocalałe store'y/trasy.

Do odpalenia lokalnie (kolejność):

```
# 1. Sekret
npm run secret:generate            # tworzy .env z JWT_SECRET

# 2. Zależności
npm install                        # workspaces: gate/web/image/games/sdk

# 3. Testy (bramka „zielone testy")
npm run test:gate                  # mockuje Mongo — nie wymaga bazy
npm run test:web
npm run test:games

# 4. Boot (bramka „czysty boot gate+web z loginem/rejestracją")
docker compose up -d               # Mongo RS + gate + web + image
# otwórz web, zarejestruj konto (pierwszy user = admin wg ustawienia admin-first)
```

Jeśli któryś test padnie po wycince — najbardziej prawdopodobne miejsca to fixture'y w `web/src/__tests__/integration/admin-roles-sync.test.ts` i `registration-disabled.test.ts` (używają starych nazw ról jako stringów; logika generyczna, ale warto docelowo zaktualizować).

## Następny krok

Etap 1 (`docs/IMPLEMENTATION_PLAN.md`): deklaratywne polityki subskrypcji row-level z filtrem wstrzykiwanym, sanityzacja per polityka, sesje gościa, kody handoff + tokeny meczu, podpisy HMAC, `useCollection` w web. Test S1 (konto-szpieg) wchodzi do CI. Tu warto rozstrzygnąć decyzję o wielotokenowości sesji.
