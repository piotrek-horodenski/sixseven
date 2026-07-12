# Etap 3 — Fala 3: i18n całej aplikacji (pl/en)

> Sesja 2026-07-11 (cz. 4). Kontrakt dla agentów — rozłączne pliki, wzorzec ETAP2D/3B.
> Biblioteka: **vue-i18n v11** (decyzja Piotra; Composition API, `legacy: false`).

## Stan zastany

- Moduły Etapu 3 (home, rooms, game-app, games, preferences) — stringi **PO POLSKU**.
- Moduły z hydry (auth, profile, admin, images, layout, settings, controls) — **PO ANGIELSKU**.
- Stringi user-facing są też w: `stores/{rooms,games,prefs}`, `composables/{useMatchClient,useTokenSocket,useCollection}`, `modules/games/rps.consts.ts`.
- `usePrefsStore().language` (`'pl'|'en'`, localStorage `hydra-language`, default `pl`) — gotowe.
- vue-i18n NIE zainstalowany — **Piotr odpala `npm install` po scaleniu** (sandbox nie ma npm).

## Setup (zrobiony centralnie, NIE ruszać przez agentów)

- `web/package.json`: dependency `vue-i18n@^11`.
- `web/src/i18n/index.ts`: `createI18n({ legacy:false, globalInjection:true, locale: DEFAULT_LANGUAGE, fallbackLocale:'en', pluralRules:{ pl: plPluralRule } })`. Eksportuje `i18n` oraz **`t`** (bound `i18n.global.t`) do użycia w plikach .ts poza komponentami.
- `web/src/config/i18n.config.ts`: `app.use(i18n)` + `watch(prefsStore.language, immediate)` → `i18n.global.locale`.
- `web/vitest.setup.ts` (+ `setupFiles` w vitest.config): instaluje i18n globalnie w @vue/test-utils (`config.global.plugins`), locale **pl**.
- Słowniki: `web/src/i18n/locales/pl/<ns>.ts` i `.../en/<ns>.ts`; `pl/index.ts` + `en/index.ts` scalają. Namespace'y: `common, auth, profile, settings, layout, admin, images, home, rooms, games, preferences`. Pliki-szkielety istnieją — agent WYPEŁNIA swoje.
- **Parytet kluczy wymuszony typem:** w pliku en: `import type pl from '../pl/<ns>'` i `const <ns>: typeof pl = {...}` — tsc wywali brakujący/nadmiarowy klucz.

## Reguły wspólne

1. W `<template>`: `{{ $t('ns.key') }}` (globalInjection). W `<script setup>` gdy potrzeba: `const { t } = useI18n()`. W .ts poza komponentami: `import { t } from '@/i18n'`.
2. Klucze: `ns.camelCase`, zagnieżdżenia dozwolone (`home.tile.waiting`). Interpolacja: `{name}`. Pluralizacja: składnia `|` — dla pl **4 formy**: `zero | jeden | 2–4 | 5+` (custom rule w setupie), np. `'brak graczy | {n} gracz | {n} gracze | {n} graczy'`; użycie `$t('key', n)`.
3. Ekstrahujemy TYLKO stringi user-facing (teksty UI, aria-labels, komunikaty błędów pokazywane w UI, tytuły). Komentarze kodu zostają po polsku. Logi konsoli/dev — zostają, nie tłumaczymy.
4. Tłumaczenia: pl naturalny (istniejące polskie stringi przenieść 1:1), en idiomatyczny (istniejące angielskie przenieść 1:1, przetłumaczyć na pl). NIE zmieniać znaczenia komunikatów.
5. Testy: setup vitest daje locale **pl** — asercje na literalne stringi EN w starych testach trzeba zaktualizować na PL (albo asercję na klucz, jeśli tak czytelniej). Testy = własność agenta obszaru.
6. Determinizm gry: `rps.consts.ts` `playerLabel` — tłumaczenie TYLKO warstwy prezentacji (nie zapisujemy przetłumaczonych stringów do stanu/ruchów).
7. Standardy sesji: sandbox nie odpala testów/Dockera (Piotr); git tylko Piotr; grep przed usunięciem; nie wchodzić w cudze pliki.

## Podział obszarów (rozłączne pliki)

### Agent A — dziedzictwo EN: auth, profile, settings, layout, controls
Namespace'y: `auth, profile, settings, layout, common`.
Pliki: `modules/auth/*`, `modules/profile/*`, `modules/settings/*`, `modules/layout/*` (+ `useProfileMenu` jeśli ma stringi), `controls/Ui*.vue` (stringi: UiAutocomplete „No results"/„Loading...", UiMultiselect „Select all", UiColorPicker „Pick color", UiSaveIndicator itd. → `common.*`), powiązane `__tests__`.
Słowniki: `locales/{pl,en}/{auth,profile,settings,layout,common}.ts`.

### Agent B — admin + images (EN)
Namespace'y: `admin, images`.
Pliki: `modules/admin/*`, `modules/images/*`, powiązane `__tests__`, `stores/admin`/`stores/images` (jeśli mają stringi UI).
Słowniki: `locales/{pl,en}/{admin,images}.ts`.

### Agent C — gra: game-app, games, composables, games.store (PL)
Namespace: `games`.
Pliki: `modules/game-app/*`, `modules/games/*` (w tym `rps.consts.ts`), `composables/{useMatchClient,useTokenSocket,useCollection}.ts`, `stores/games/*`, powiązane `__tests__`.
Słowniki: `locales/{pl,en}/games.ts`.

### Agent D — home, rooms/create, preferences, prefs-stores, routes (PL)
Namespace'y: `home, rooms, preferences`.
Pliki: `modules/home/*`, `modules/rooms/*`, `modules/preferences/*`, `stores/rooms/*`, `stores/prefs/*` (labels w `game-prefs.catalog`), `router/routes/*` (tytuły/meta jeśli są), powiązane `__tests__`.
Słowniki: `locales/{pl,en}/{home,rooms,preferences}.ts`.

**Kolizje zakazane:** nikt poza A nie dotyka `common.ts`; jeśli obszar potrzebuje wspólnego stringa („Zapisz", „Anuluj", „Zamknij", „Wróć", „Ładowanie…", „Błąd") — używa klucza z `common` (lista w szkielecie) BEZ edycji pliku.

## Weryfikacja (po scaleniu)

1. `tsc`/`vue-tsc` — parytet kluczy pl/en wymusza typ.
2. Grep za resztkami: `[ąćęłńóśźż]` w `.vue`/template'ach + ręczny przegląd EN stringów.
3. Piotr: `npm install`, `npm test --workspace web`, smoke: przełącznik języka w `/preferences` zmienia całą apkę na żywo.
