# Tworzenie gry na sixseven — przewodnik dewelopera

> **Status: projekt (spec).** SDK i rejestracja jeszcze nie istnieją — ten dokument definiuje docelowe developer experience i jest specyfikacją dla `@sixseven/sdk`. Rzeczy oznaczone *(później)* nie wchodzą do MVP.
>
> Tutoriale: **easy** — papier, kamień, nożyce (kompletny kod przykładowy poniżej); **zaawansowany** — arrowsoccer (`docs/games/ARROWSOCCER.md`), implementacja referencyjna z fizyką, opcjami meczu i odznakami.

## Jak działa gra na platformie

Cała gra żyje **na Twojej infrastrukturze**: serwis logiki (HTTP) + aplikacja UI (Twój origin). Platforma prowadzi mecz — fazy, timery, zbieranie i ukrywanie ruchów, stan, historia, matchmaking, rating — i woła Twój serwis, gdy potrzebuje decyzji gry.

Logika to **czysta, bezstanowa funkcja** — stan przechowuje platforma i przysyła Ci go przy każdym wywołaniu. Piszesz w dowolnym języku (wire contract po HTTP); w TypeScript najprościej: implementujesz `GameDefinition`, a `sixseven-sdk serve` opakowuje go w gotowy serwis. Cykl każdej rundy:

1. Wszyscy gracze **równocześnie** planują ruch (faza planowania, np. 30 s).
2. Po deadline (lub komplecie ruchów) silnik woła Twoje `resolve` ze wszystkimi ruchami naraz.
3. Wynik jest ujawniany wszystkim (reveal), gra trwa albo się kończy.

Z tego wynikają dwie żelazne zasady:

- **Determinizm.** Ten sam stan + ruchy + seed = ten sam wynik. Zakazane: `Math.random()` (używaj `rng` z SDK), `Date.now()`, odczyt czegokolwiek spoza argumentów. Pipeline to weryfikuje podwójnym wykonaniem.
- **Ukryta informacja.** Klient gracza widzi wyłącznie to, co zwrócisz z `viewFor(state, playerId)`. Jeśli włożysz tam cudze niezrozstrzygnięte ruchy — gra zostanie odrzucona.

## 0. Konto dewelopera

1. Załóż zwykłe konto gracza na sixseven (albo użyj istniejącego — deweloperzy grają jak wszyscy).
2. W profilu: `Ustawienia → Deweloper → aktywuj konto deweloperskie` (akceptacja regulaminu integralności — w skrócie: nie budujesz kanałów bocznych między sesjami graczy, nie prosisz o hasła, odpowiadasz zgodnie z kontraktem).
3. Wygeneruj token API (`Ustawienia → Deweloper → API tokens`) — użyje go CLI (`sixseven-sdk login`).

Konto deweloperskie ma dziedziczoną reputację: nowa gra startuje z renomą Twojego konta (nowe konto: 100%) i bonusem sprawdzalności za historię poprzednich gier. Szczegóły: sekcja „Renoma i sprawdzalność".

## 1. Start projektu

```bash
npm create @sixseven/game my-game
cd my-game && npm install
```

Struktura:

```
my-game/
├── game.config.json      # manifest
├── src/
│   ├── index.ts          # GameDefinition (default export)
│   └── server.ts         # platformSdk.serve(game) → serwis HTTP logiki
├── tests/
│   └── game.test.ts      # twoje testy (vitest)
└── package.json
```

Piszesz w innym języku? Zamiast SDK zaimplementuj **wire contract** (te same operacje jako HTTP: `POST /init`, `/validate-move`, `/resolve`, `/annotate` — spec w dokumentacji SDK). Wszystko poniżej o kontrakcie funkcji przekłada się 1:1.

Manifest `game.config.json`:

```json
{
  "id": "my-game",             // unikalny, kebab-case, przydzielany przy rejestracji
  "name": "My Game",
  "version": "1.0.0",          // semver
  "minPlayers": 2,
  "maxPlayers": 2,
  "planningPhaseMs": 30000,   // minimum 2000 — platforma nie jest silnikiem real-time
  "description": "…",
  "thumbnail": "./thumbnail.png",
  "badges": [
    { "id": "unbeaten-5", "label": "Niezwyciężony", "description": "{streak} zwycięstw z rzędu", "sentiment": "positive" },
    { "id": "rps-noob", "label": "Łamaga w papier, kamień, nożyce", "sentiment": "negative" }
  ],
  "options": {
    "presets": [
      { "id": "classic", "label": "Klasyk", "default": true, "values": { "winsToFinish": 3 } }
    ],
    "fields": [
      { "key": "winsToFinish", "label": "Rund do wygranej", "type": "int", "min": 1, "max": 10 }
    ]
  }
}
```

`badges` to pula adnotacji, które gra może przyznawać graczom (sekcja „Adnotacje graczy"). Teksty są moderowane raz, przy publikacji — w runtime tylko je przyznajesz. `sentiment: positive` = odznaka publiczna na profilu; pozostałe widzi wyłącznie sam gracz.

`options` to schemat **opcji meczu**: host ustawia je w lobby (platforma renderuje presety i pola generycznie, waliduje typy i zakresy), a wynik trafia do Twojego `init` jako czwarty argument. Presety są też jednostką matchmakingu — szybki mecz gra na domyślnym.

## 2. Implementacja kontraktu

Gra to default export obiektu `GameDefinition<State, Move, View>`. Kompletny przykład — papier, kamień, nożyce do 3 wygranych rund:

```ts
import type { GameDefinition, Rng } from '@sixseven/sdk'

type Shape = 'rock' | 'paper' | 'scissors'
type State = { round: number; wins: Record<string, number>; players: string[]; defaults: Record<string, Shape | undefined>; winsToFinish: number }
type Move = { shape: Shape }
type View = { round: number; wins: Record<string, number>; you: string }
type Prefs = { defaultShape?: Shape }   // gracz ustawia w UI gry, wraca w init

const BEATS: Record<Shape, Shape> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
const SHAPES: Shape[] = ['rock', 'paper', 'scissors']

const game: GameDefinition<State, Move, View> = {
  // meta czytane z game.config.json — nie duplikujesz go w kodzie

  init(playerIds, seed, playerData, options) {
    return {
      round: 1,
      players: playerIds,
      winsToFinish: options.winsToFinish,   // opcje meczu ustawione przez hosta w lobby
      wins: Object.fromEntries(playerIds.map(p => [p, 0])),
      // preferencje gracza z pamięci gry — np. „jak nic nie wybiorę, graj kamień".
      // prefs pisze UI przez API — traktuj jako NIEZAUFANE: waliduj/klampuj tutaj
      defaults: Object.fromEntries(playerIds.map(p => {
        const shape = playerData[p]?.prefs?.defaultShape
        return [p, SHAPES.includes(shape as Shape) ? shape : undefined]
      })),
    }
  },

  validateMove(state, playerId, move): move is Move {
    return !!move && typeof move === 'object' && SHAPES.includes((move as Move).shape)
  },

  // ruch przyjmowany, gdy gracz nie zdążył lub się rozłączył
  defaultMove(state, playerId, rng: Rng) {
    return { shape: state.defaults[playerId] ?? SHAPES[rng.int(0, 2)] }   // pref gracza albo deterministyczny rng
  },

  // serce gry: komplet ruchów rundy → nowy stan + punkty + zdarzenia
  resolve(state, moves) {
    const [a, b] = state.players
    const ma = moves[a].shape, mb = moves[b].shape
    const events = [
      { type: 'played', playerId: a, shape: ma },
      { type: 'played', playerId: b, shape: mb },
    ]
    const points: Record<string, number> = { [a]: 0, [b]: 0 }
    const wins = { ...state.wins }
    if (ma !== mb) {
      const winner = BEATS[ma] === mb ? a : b
      wins[winner]++; points[winner] = 1
      events.push({ type: 'round-won', playerId: winner })
    } else {
      events.push({ type: 'draw' })
    }
    return { state: { ...state, round: state.round + 1, wins }, points, events }
  },

  isFinished(state) {
    const winner = state.players.find(p => state.wins[p] >= state.winsToFinish)
    return winner ? { finished: true, winnerIds: [winner] } : { finished: false }
  },

  // jedyne, co klient kiedykolwiek zobaczy — tu nie ma czego ukrywać,
  // bo ruchy bieżącej rundy nigdy nie trafiają do stanu przed resolve
  viewFor(state, playerId) {
    return { round: state.round, wins: state.wins, you: playerId }
  },
}

export default game
```

Wskazówki:

- `resolve` dostaje **komplet** ruchów (spóźnieni mają już wstawione `defaultMove`) — nie obsługujesz braków.
- Jeśli reveal Twojej gry to animacja (np. symulacja fizyki), zwróć z `resolve` dodatkowo `revealDurationMs` — silnik poczeka z kolejną fazą planowania na `reveal-done` od klientów, maksymalnie `revealDurationMs + margines`. Klienci animują lokalnie (patrz sekcja 6), serwer nie streamuje klatek.
- Do geometrii/fizyki używaj helperów `@sixseven/sdk/math` (wektory, sqrt, funkcje trygonometryczne o gwarantowanym wyniku) — natywne `Math.sin`/`Math.cos` mogą różnić się między środowiskami i psuć determinizm.
- `validateMove` dostaje `unknown` — klientowi nie ufamy, waliduj strukturalnie. Uwaga: jest wywoływane **wewnątrz `/resolve`**, po zamknięciu fazy planowania — Twój serwis nie widzi żadnego ruchu wcześniej (zasada „safe secret" platformy). Nielegalny ruch → `defaultMove` + wpis w `events`. Walidację „na żywo" dla UX rób w swojej aplikacji UI, która zna reguły.
- `events` to materiał dla UI i historii ("A zagrał papier") — po reveal wszystko jest jawne.
- Stan trzymaj serializowalny (czysty JSON): jest zapisywany po każdej rundzie i odtwarzany po restarcie serwera.
- Gry z ukrytą informacją w stanie (np. ręka kart): `viewFor` musi ją filtrować per gracz — to jest testowane.

## 2a. Pamięć gry i adnotacje graczy (opcjonalnie)

Gra ma pamięć per gracz, trwałą między meczami. Scope per gra wymusza platforma: piszesz wyłącznie pod własnym `gameId`, z innymi grami nie da się „pogryźć". Pamięć ma dwa obszary o różnych właścicielach zapisu:

| Obszar | Kto pisze | Kiedy | Do czego |
|---|---|---|---|
| `data` | logika gry (`annotate`) | po zakończeniu meczu | akumulator: serie, bilans, rywalizacje |
| `prefs` | aplikacja UI gry (API) | w dowolnym momencie meczu | preferencje gracza: domyślny ruch, ustawienie zawodników |

Oba obszary wracają do Ciebie w `init(playerIds, seed, playerData)` przy każdym nowym meczu — snapshot z chwili startu (zmiana `prefs` w trakcie partii obowiązuje od następnej). Limit: 4 KB per obszar per gracz, czysty JSON.

```ts
type PlayerData = { wins: number; losses: number; streak: number }  // twój kształt, ≤ 4 KB

const game: GameDefinition<State, Move, View, PlayerData> = {
  // ...

  // wywoływane raz, po isFinished; prevData = to, co zapisałaś/eś po poprzednich meczach
  annotate(finalState, prevData) {
    const result: AnnotateResult<PlayerData> = {}
    for (const p of finalState.players) {
      const prev = prevData[p] ?? { wins: 0, losses: 0, streak: 0 }
      const won = finalState.wins[p] >= 3
      const data = {
        wins: prev.wins + (won ? 1 : 0),
        losses: prev.losses + (won ? 0 : 1),
        streak: won ? prev.streak + 1 : 0,
      }
      result[p] = {
        data,                                                        // prywatna pamięć gry
        grant: data.streak >= 5 ? [{ badgeId: 'unbeaten-5', params: { streak: data.streak } }] : [],
        revoke: !won ? ['unbeaten-5'] : [],                          // seria przerwana → odbierz
      }
    }
    return result
  },
}
```

Zasady:

- `data` widzi tylko Twoja gra (wraca w `prevData` w `annotate` i w `playerData` w `init`). JSON round-trip.
- `prefs` z poziomu logiki są tylko do odczytu — pisze je aplikacja UI (sekcja 6).
- `grant`/`revoke` operują wyłącznie na `badgeId` z manifestu — nieznane id = fail walidacji.
- Ten sam reżim co `resolve`: czysta funkcja, deterministyczna, limit czasu. Żadnych „odznak losowych" bez `rng`.
- Odznaki, które mogą przestać obowiązywać, projektuj z `revoke` od razu — platforma nie wygasza ich za Ciebie.

## 3. Testowanie lokalne

```bash
npm test                                        # twoje testy jednostkowe (vitest)
npx sixseven-sdk serve --dev                    # lokalny serwis logiki
npx sixseven-sdk test http://localhost:4300     # ten sam harness, którym platforma zweryfikuje Twój serwis przy rejestracji
```

Harness kontraktowy sprawdza:

| Test | Co znaczy fail |
|---|---|
| Zgodność manifestu | meta niepoprawne / niezgodne z eksportem |
| Determinizm | dwa wykonania tej samej partii dały różny wynik — masz ukrytą losowość lub mutację wejścia |
| Fuzzing ruchów | `validateMove`/`resolve` rzuca wyjątek na śmieciowych danych |
| Limity czasu | odpowiedź `/resolve` > 2 s (budżet z kontraktu, mierzony po HTTP razem z siecią) |
| Serializacja stanu | stan nie przeżywa JSON round-trip (funkcje, Date, cykle) |
| Leak w `viewFor` | widok gracza zawiera dane oznaczone jako prywatne innych graczy |
| `defaultMove` | zwraca ruch, którego `validateMove` nie akceptuje |
| `annotate` | nieznany `badgeId`, `data` > 4 KB lub niedeterministyczne |

```bash
npx sixseven-sdk play   # (później) lokalny runner: rozegraj partię w terminalu/przeglądarce bez platformy
```

## 4. Deploy serwisu logiki

Serwis hostujesz sam — VPS, kontener, serverless, cokolwiek utrzyma budżet czasu odpowiedzi. Wymagania:

- **Bezstanowość:** cały stan przychodzi w żądaniu; możesz skalować serwis poziomo i restartować bez wpływu na mecze.
- **Weryfikacja podpisów:** każde żądanie silnika jest podpisane (HMAC + timestamp, sekret z rejestracji). `sixseven-sdk serve` weryfikuje automatycznie; przy własnej implementacji odrzucaj żądania bez ważnego podpisu (ochrona przed podszywaniem się pod platformę) i starsze niż 30 s (replay).
- **Budżet czasu:** `/resolve` ≤ 2 s — liczone od żądania do odpowiedzi, razem z siecią. Przekroczenie = retry, seryjne przekroczenia = pauza meczu i spadek renomy gry.
- **Nie zobaczysz ruchów w trakcie planowania:** platforma woła Twój serwis dopiero po zamknięciu fazy, z kompletem ruchów. To celowe („safe secret") — nie projektuj niczego, co zakłada wcześniejszy dostęp.
- **Spodziewaj się audytów w każdej chwili:** część wywołań to niezapowiedziane audyty nieodróżnialne od produkcji — replay historycznej rundy (odpowiedź musi być identyczna) albo stan lustrzany (wynik musi być symetryczny). Wynika z tego praktyczna reguła: **zero efektów ubocznych per wywołanie** (liczników, powiadomień, zapisów) — i tak masz być bezstanowy.
- **Dostępność to Twoja odpowiedzialność:** serwis w dół = Twoje mecze stoją (platforma pauzuje, po dłuższym oknie anuluje bez zmian ratingu — gracze nie tracą, ale gra traci reputację w katalogu).
- Wyjątek/odpowiedź poza schematem traktowane są jak brak odpowiedzi — nie próbuj łapać wszystkiego, po prostu odpowiadaj poprawnie.

## 5. Rejestracja i publikacja

Token deweloperski generujesz w profilu na platformie (`Ustawienia → Deweloper → API tokens`).

```bash
npx sixseven-sdk login                                   # zapisuje token lokalnie
npx sixseven-sdk register --logic https://api.my-game.dev --app https://play.my-game.dev
                                                         # manifest + URL-e → start weryfikacji
npx sixseven-sdk status my-game                          # stan weryfikacji / health
```

Cykl życia:

```
registered → validating → ┬ validated → (approve admina) → published — w katalogu
                          └ rejected (raport błędów, ten sam format co lokalny test)
```

- Weryfikacja to **dokładnie ten sam harness**, co `sixseven-sdk test`, tylko uderzający w Twój produkcyjny URL. Jeśli przechodzi lokalnie, a pada przy rejestracji — sprawdź różnice środowisk, potem zgłoś.
- W MVP publikację zatwierdza admin (przegląd opisu, thumbnail, odznak). *(później)* automatyczne publikowanie dla zweryfikowanych kont.
- **Nowa wersja manifestu** (odznaki, opcje, liczba graczy) wymaga ponownej weryfikacji. Logikę deployujesz kiedy chcesz — ale stan trwających meczów pochodzi z poprzednich wywołań, więc nowa wersja musi umieć przyjąć stary kształt stanu (albo wersjonuj pole w stanie).
- Platforma okresowo health-checkuje serwis i powtarza kontrakt-testy po zmianie wersji; przewlekła niedostępność = unpublish do czasu naprawy.

### Renoma i sprawdzalność — zaufanie jako waluta

Twoja gra ma dwie publiczne miary, widoczne w katalogu:

- **Renoma** — startujesz ze 100%. Spada tylko wtedy, gdy Twoja gra działa wbrew integralności platformy: odpowiedź poza schematem, złamany determinizm, timeouty seryjne, wykryty przeciek ruchów, nadużycie odznak.
- **Sprawdzalność** — startujesz z 0%. Rośnie z każdą spójną odpowiedzią API, każdym meczem rozegranym bez niespójności przez realnych, niepowiązanych graczy (boty grające same ze sobą ≈ zero wagi) i każdym przejściem okresowych testów. Incydent też ją podnosi — platforma wtedy wie o Tobie więcej.

Zaufanie kupuje przywileje: wyższy limit równoległych meczów, dostęp do ranked, publikację nowych wersji bez ręcznego approve, wyróżnienie „sprawdzona". Nowa gra jest niewinna, ale niesprawdzona — pierwsze tygodnie gra na małej kwocie meczów i buduje sprawdzalność. Gra po incydencie jest w gorszej pozycji niż nowa — odbudowa renomy jest powolna i częściowa. Najtańsza strategia: po prostu odpowiadaj poprawnie.

## 7. Zarządzanie grą po publikacji

**Dashboard** (`Ustawienia → Deweloper → Twoje gry`): status publikacji, renoma i sprawdzalność z historią, Twoje `trust_events` (każdy z typem i — przy naruszeniach — dowodem do odtworzenia), health serwisu, liczba meczów i kwota równoległych, wyniki ostatnich audytów.

**Wersje i deploye:**
- Logikę deployujesz kiedy chcesz — ale nowa wersja musi przyjmować stan zapisany przez starą (mecze trwają; wersjonuj pole w stanie, gdy zmieniasz jego kształt). Cicha zmiana zachowania na tym samym stanie zostanie wykryta replay-auditem jako naruszenie.
- Zmiana manifestu (odznaki, opcje, liczba graczy) = `sixseven-sdk register` ponownie → ponowna walidacja (automatyczny approve od progu zaufania).
- Nowy bundle UI = `sixseven-sdk publish-ui` (wersjonowany; trwające mecze dograją na starym).

**Incydent — co robić, gdy renoma spadła:**
1. Zajrzyj do `trust_events` — każdy werdykt ma dowód (wejście/wyjście wywołania). Odtwórz go lokalnie (`sixseven-sdk test` + zapisane żądanie).
2. Napraw i zadeployuj. Odbudowa renomy dzieje się sama, czystą kartoteką — powoli, asymptotycznie i po incydencie nigdy do 100%. Nie ma „odwołania czyszczącego historię"; jest za to uczciwa krzywa powrotu.
3. Spadek poniżej progu katalogu = unpublish do czasu naprawy (trwające mecze są dogrywane albo anulowane bez ratingu). Po naprawie gra wraca automatycznie po przejściu re-walidacji.

**Wycofanie gry (`unpublish` na życzenie):** blokuje nowe mecze, nie przerywa trwających; pamięć gry i adnotacje graczy zostają (to dane graczy).

**Czego nie rób:** nie testuj „czy audyt mnie widzi" (wywołania audytowe są nieodróżnialne — próby detekcji same są sygnałem), nie farmuj sprawdzalności botami (waga powiązanych kont ≈ 0, a wzorzec trafia do dossier), nie loguj payloadów ruchów po stronie UI (przy przeglądzie bundle'a to czerwona flaga).

## 6. UI gry — Twoja aplikacja webowa

UI gry to osobna aplikacja webowa. Piszesz ją w czymkolwiek — Vue, React, czysty canvas, WebGL. Platforma pokazuje grę w katalogu i organizuje mecze; gdy mecz startuje, gracz jest **przekierowywany do aplikacji gry**, a po zakończeniu wraca na ekran wyniku platformy.

Hosting UI ma **dwa poziomy zaufania** (ochrona tajemnicy ruchów — Twoja aplikacja z natury widzi strzałki/ruchy gracza w trakcie rysowania):

| Poziom | Hosting | CSP | Dostępne tryby |
|---|---|---|---|
| **Zaufany** | statyczny bundle uploadowany do platformy (`sixseven-sdk publish-ui`), serwowany na `twoja-gra.g.sixseven.gg` | `connect-src` tylko API platformy, blokada WebRTC — przeglądarka gracza fizycznie blokuje inne połączenia | ranked, szybki mecz, wszystko |
| **Self-hosted** | Twój origin (np. `play.my-game.dev`) | brak wymuszenia | tylko mecze towarzyskie; etykieta „UI poza platformą" w katalogu |

Konsekwencje poziomu zaufanego: bundle jest w pełni statyczny i samowystarczalny — fonty, tekstury, biblioteki (three.js itd.) w środku, zero CDN-ów i zewnętrznych zapytań; bez SSR i własnego backendu UI. Cała komunikacja wyłącznie przez API platformy. Możesz zacząć self-hosted i awansować do ranked, publikując bundle.

**Handoff i autoryzacja:**

```
1. Platforma przekierowuje gracza (na Twój origin albo bundle na platformie — zależnie od poziomu):
   https://twoja-gra.g.sixseven.gg/?handoff=JEDNORAZOWY_KOD

2. Twoja aplikacja wymienia kod na token meczu:
   POST https://api.sixseven.gg/auth/match-token { code }
   → { token, matchId, playerId, gameId, expiresAt }

3. Z tokenem łączysz się z API jak każdy klient:
   - subskrypcja swojego widoku (match_views: playerId == ty) i metadanych meczu (matches)
   - składanie ruchów: games:submit-move { matchId, move }
   - potwierdzenie animacji reveal: games:reveal-done { matchId, round }
     (jeśli logika zwraca revealDurationMs; brak acku = start po revealDuration + margines)
   - zapis preferencji gracza: PUT /games/:gameId/players/me/prefs { ... }
     (obszar prefs pamięci gry — wraca do logiki w init od następnego meczu; ≤ 4 KB)
```

Jeśli współdzielisz moduł symulacji między logiką a UI (zalecane przy grach fizycznych — animujesz reveal, uruchamiając tę samą deterministyczną symulację ze stanu + ujawnionych ruchów), trzymaj go w osobnym pakiecie importowanym przez oba bundle.

Token jest **scoped do meczu**: jeden gracz, jeden mecz, tylko własny widok i ruchy, wygasa z końcem partii. Nie dostaniesz (i nie potrzebujesz) tożsamości konta, czatu ani znajomych gracza. Kod handoff jest jednorazowy i krótkotrwały — wymień go od razu na starcie.

**Co rysujesz sam (dane masz w `matches`):** timer fazy (`deadline`), listę graczy z gotowością (`ready`), punkty, fazę. Po `isFinished` platforma pokaże swój ekran wyniku — Twoja aplikacja powinna zaproponować powrót (`returnUrl` z handoffu).

**Motyw (opcjonalnie, zalecane):** handoff niesie `theme=dark|light`, a `GET /themes/tokens.json` zwraca tokeny kolorów platformy — użyj ich, żeby gracz nie dostał białego flasha między dark-mode platformą a Twoją grą.

**Zasady:**

- **Nigdy nie proś o login/hasło platformy.** Całą autoryzację daje handoff. Formularz logowania w aplikacji gry = ban.
- **Nie buduj kanałów bocznych między sesjami graczy.** Tajemnica ruchów do reveal to rdzeń platformy. Platforma aktywnie wykrywa przecieki (analiza statystyczna wyników, mecze-pułapki z instrumentowanymi klientami); potwierdzony przeciek = unpublish i ban konta deweloperskiego.
- Reconnect: token działa do końca meczu — po odświeżeniu strony wznów subskrypcję (dostaniesz świeży snapshot `collection-init`).
- Nie polegaj na UI w kwestiach reguł: i tak każdy ruch waliduje serwer przez Twoje `validateMove`.

**Hosting:** Twój, jak cała gra. Statyczny hosting wystarczy — aplikacja rozmawia bezpośrednio z API platformy.

## Checklist przed rejestracją

- [ ] `sixseven-sdk test` przechodzi przeciw docelowemu URL-owi serwisu
- [ ] Serwis: HTTPS, weryfikacja podpisów, bezstanowy, mieści się w budżecie czasu (razem z siecią!)
- [ ] Zero źródeł niedeterminizmu (`Math.random`, `Date.now`, stan modułu)
- [ ] `viewFor` nie zdradza niczego, czego gracz nie powinien widzieć
- [ ] `defaultMove` daje grywalny ruch (gracz AFK nie psuje partii reszcie)
- [ ] Stan przeżywa JSON round-trip
- [ ] Gra kończy się zawsze (brak nieskończonych partii — rozważ limit rund)
- [ ] Odznaki: każda odbieralna ma logikę `revoke`; sentiment ustawiony uczciwie (negatywne nie przejdą review jako „positive")
- [ ] Manifest: opis, thumbnail, poprawne min/max graczy
- [ ] Aplikacja UI: wymienia handoff od razu, wznawia po odświeżeniu, oferuje powrót na platformę
- [ ] Celujesz w ranked? Bundle UI samowystarczalny (zero zewnętrznych zapytań — przejdzie CSP) i opublikowany przez `sixseven-sdk publish-ui`
- [ ] Aplikacja UI respektuje `theme` z handoffu (dark/light bez flasha)
- [ ] Zero formularzy logowania — autoryzacja wyłącznie przez handoff
