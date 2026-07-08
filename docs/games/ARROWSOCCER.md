# arrowsoccer — dokument projektowy

> Flagowa gra sixseven: turowa piłka nożna z konfigurowalną fizyką. 1v1, po 4 zawodników na gracza. Status: projekt.
>
> Arrowsoccer pełni też rolę **implementacji referencyjnej i tutoriala** tworzenia gry na platformę: serwis logiki + aplikacja UI na infrastrukturze dewelopera, rejestracja przez `sixseven-sdk register`. Budowany dokładnie tą ścieżką, którą przejdzie każdy zewnętrzny dev (`docs/GAME_DEV_GUIDE.md`).

## Koncept

Boisko z dwiema bramkami, piłka odbija się od linii outu (brak autów — banda jak w piłkarzykach). Gracze **równocześnie i w tajemnicy** planują turę: przeciągnięcie z zawodnika rysuje strzałkę — kierunek i siłę impulsu (siła ∝ długość, z limitem). Po reveal wszystkie strzałki stają się jawne i rusza symulacja fizyki: impulsy, zderzenia, odbicia, tarcie. Kopnięcie piłki to po prostu kolizja zawodnika z piłką. Gol → wznowienie od środka.

## Zasady

- **Start i wznowienia:** piłka na środku, zawodnicy na pozycjach domyślnych gracza (prefs). Formacja jest definiowana w **przestrzeni kanonicznej**: pół boiska „atak do przodu", z wyłączeniem połówki koła środkowego — edytor formacji pokazuje dokładnie ten obszar. W meczu formacja jest obracana o 0° albo 180° zależnie od strony. Nielegalne pozycje (koło, poza połową, nakładający się zawodnicy) `init` klampuje do najbliższych legalnych — prefs są niezaufane.
- **Tura:** gracz rysuje strzałki dla dowolnego podzbioru swoich zawodników (0–4). Zawodnik bez strzałki stoi. Timeout gracza = `defaultMove` = brak impulsów (wszyscy stoją).
- **Rozstrzygnięcie:** symulacja od impulsów do wytracenia energii (próg prędkości) albo twardego limitu czasu symulacji. Gol w trakcie symulacji = gwizdek: symulacja się kończy, punkt (gol samobójczy liczy się przeciwnikowi), następna tura od wznowienia.
- **Koniec meczu:** wg opcji hosta — do X goli, limit tur (wygrywa wynik), albo oba (co pierwsze). Remis po limicie tur → złota tura (sudden death) albo remis, wg opcji.

## Przepływ tury (na kontrakcie platformy)

1. `Planning` — obie strony rysują strzałki; przeciwnik widzi tylko „gotowy", nigdy strzałki (ruchy nie wchodzą do stanu przed `resolve` — gwarancja architektury).
2. `resolve(state, moves)` — deterministyczna symulacja krok po kroku (stały timestep); zwraca stan końcowy, `events` (strzałki obu stron, gole) i **`revealDurationMs` = czas symulacji**.
3. `Revealing` — aplikacje graczy odtwarzają **tę samą symulację lokalnie** (współdzielony moduł fizyki między bundle logiki a UI) jako animację; po zakończeniu wysyłają `reveal-done`. Silnik startuje kolejną turę po komplecie acków albo po `revealDurationMs + margines` — maruder nie blokuje meczu.

## Fizyka

Top-down 2D, wszystkie ciała to koła (8 zawodników + piłka).

**Symulacja kwantowa (lekcja z poprzedniej implementacji — najważniejsza zasada):** czas liczony wyłącznie w małych, stałych kwantach. W każdym kwancie, w tej kolejności: integracja ruchu → wykrycie kolizji (koło–koło i koło–banda) → odbicia → **egzekucja niezmiennika: nic nie opuszcza boiska** (poza piłką w świetle bramki). Żadnego zmiennego timestepu, żadnego analitycznego „przewijania" do zdarzenia. Konsekwencje praktyczne:

- Kwant musi być mały względem prędkości maksymalnej i najmniejszego promienia — inaczej tunelowanie (piłka przelatuje przez bandę/zawodnika między kwantami). Strażnik: `vMax · Δt < min(r)`, co wiąże `maxForce` z długością kwantu; szybkie presety (flipper) mogą wymagać subkroków.
- Klamp do boiska po każdym kwancie to niezmiennik, nie naprawa błędu — float zawsze w końcu wypchnie ciało o epsilon za linię.
- Kwant symulacji jest niezależny od FPS renderu (klient interpoluje między kwantami do 60/120 Hz ekranu).
- Determinizm = ta sama liczba kwantów, ta sama kolejność ciał w pętli kolizji, matematyka wyłącznie z `@sixseven/sdk/math`. `revealDurationMs = liczbaKwantów · Δt`.

Poza tym: integracja półniejawna, tłumienie liniowe (tarcie), restytucja na zderzeniach i bandach, bramki jako przerwy w bandzie; gol = środek piłki przecina linię bramkową między słupkami.

**Parametry (opcje meczu, schemat w manifeście):**

| Pole | Znaczenie |
|---|---|
| `maxForce` | limit siły strzałki (długość → impuls) |
| `friction` | tłumienie ruchu |
| `restitution` | sprężystość zderzeń i band |
| `playerMass` / `ballMass`, `playerRadius` / `ballRadius` | masy i rozmiary |
| `goalsToWin`, `maxTurns`, `suddenDeath` | format meczu |
| `planningPhaseMs` | czas na turę |

**Presety:** `klasyk` (domyślny, jedyny w rankingu/szybkim meczu), `lodowisko` (niskie tarcie), `błoto` (wysokie tarcie, mała siła), `flipper` (restytucja > 1 na bandach). Suwaki w zakresach z manifestu — pokoje prywatne mogą składać własne warianty.

## Typy kontraktu (szkic)

```ts
type UnitId = string                                  // 4 na gracza
type Vec = { x: number; y: number }

type Move = { arrows: Record<UnitId, Vec> }           // wektor impulsu W PRZESTRZENI ŚWIATA; podzbiór własnych zawodników
type Prefs = { formation?: Record<UnitId, Vec> }      // pozycje w przestrzeni kanonicznej (niezaufane → klamp w init)
type Data = { wins: number; losses: number; streak: number; goalsFor: number; goalsAgainst: number }

type State = {
  turn: number
  score: Record<string, number>
  sides: Record<string, 0 | 180>                      // obrót formacji gracza w tym meczu
  bodies: { units: Record<UnitId, { owner: string; pos: Vec }>; ball: { pos: Vec } }
  formations: Record<string, Record<UnitId, Vec>>     // kanoniczne, po klampie; obracane przy wznowieniach
  options: MatchOptions
  phase: 'kickoff' | 'open'                           // wznowienie vs gra
}

type View = State & { myArrows?: Record<UnitId, Vec> } // pozycje są jawne; ukryte są tylko strzałki w planowaniu
```

`validateMove`: zawodnicy należą do gracza, wektory skończone, |v| ≤ `maxForce` (dłuższa strzałka ucinana już w UI, ale serwer waliduje niezależnie). `events` po reveal zawierają komplet strzałek — to one, plus stan początkowy tury, wystarczają UI do odtworzenia symulacji.

## Odznaki (manifest)

Przykładowa pula: `unbeaten-footballer` „Niezwyciężony piłkarz" (positive, seria ≥ N zwycięstw, revoke po porażce), `sniper` „Snajper" (positive, gol z własnej połowy), `dry-spell` „Posucha" (negative, N meczów bez gola), `own-goal-artist` „Samobój-artysta" (negative). `data` akumuluje bilans i serie.

## Aplikacja UI

**Three.js**, dystrybuowany jako **zaufany bundle na platformie** (gra celuje w ranked, więc obowiązuje CSP: wszystko — three.js, fonty, tekstury — zbundlowane, zero zewnętrznych zapytań). Dwie warstwy fizyki o różnych regułach:

- **Symulacja rozgrywki** — współdzielony deterministyczny moduł (ten sam co w bundle'u logiki): pozycje, zderzenia, gole. Steruje animacją reveal.
- **Prezentacja** — niedeterministyczna, czysto wizualna, bo nie wpływa na stan: **siatka bramki jako cloth reagująca na piłkę przy golu** (kluczowy moment gry — siatka ma zachowywać się jak prawdziwa), drobne efekty, kamera. Gol już zapadł w symulacji; siatka tylko go celebruje.

**Perspektywa gracza:** stan świata jest w jednym układzie współrzędnych, ale każdy klient renderuje boisko od swojej strony — Twój zespół zawsze na dole, natarcie do przodu. Na telefonie boisko pionowo (portrait), drag & drop strzałek projektowany mobile-first. Konsekwencja: strzałki rysowane w przestrzeni widoku muszą być transformowane do przestrzeni świata przed `submit-move` (obrót 0/180°, ta sama macierz co formacja).

**Pozostałe:** edycja/kasowanie strzałek przed wysłaniem, edytor formacji (pół boiska minus pół koła, zapis do prefs przez API; UI powtarza walidację dla UX, ale prawda jest w klampie `init`), tablica wyniku i timer z `matches`, motyw z tokenów platformy.

## Otwarte pytania

- Czy strzałki można rysować też „w przyszłość" piłki (celowanie z wyprzedzeniem) — czy tylko impuls od aktualnej pozycji? (MVP: tylko impuls)
- Kolizje zawodników tej samej drużyny — pełne zderzenia czy przenikanie? (skłaniam się: pełne, więcej taktyki)
- 2v2 (2 graczy × 2 zawodników po stronie?) — kontrakt platformy wspiera minPlayers/maxPlayers, ale projekt formacji i wznowień do przemyślenia. Po MVP.
- Widzowie (spectator mode) — wymaga polityki subskrypcji „widz widzi stan, nie widzi strzałek w planowaniu". Po MVP.
- Dokładne wymiary boiska, koła i zakresy suwaków — do playtestów.
