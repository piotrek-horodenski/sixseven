# web — interfejs platformy

## Rola

Twarz sixseven (Vue 3): katalog gier, lobby i pokoje, profile i społeczność, ekran wyniku meczu, panel admina. **Nie renderuje samych meczów** — mecz dzieje się w aplikacji gry (redirect z handoffem); web wita gracza z powrotem wynikiem i rewanżem. W modelu sekretu web jest klientem jak każdy inny: widzi wyłącznie to, na co pozwalają polityki subskrypcji gate — zero specjalnych uprawnień.

## Odpowiedzialności

- **Ekrany** (mapowanie na sloty layoutu — tabela w `ARCHITECTURE.md`): katalog gier (z renomą/sprawdzalnością), hub gry (graj / pokoje / ranking / zasady), lobby pokoju z generycznym rendererem opcji meczu (schemat z manifestu: presety + pola), ekran powrotu z meczu (wynik z `match_events`, rewanż), profil (odznaki wg sentiment, ELO, historia), znajomi + presence, czat, rejestracja/logowanie/goście, panel dewelopera (gry, tokeny, dashboard zaufania), panel admina (moderacja rejestracji, dossier judge, konfiguracja AI targetingu).
- **Przepływy:** przekierowanie do gry (handoff) i powrót; konwersja gościa w konto; zaproszenia linkiem.

## Fundament z hydry (bierzemy w całości)

System slotów layoutu (9 named RouterView z animacjami per slot), dark/light mode na CSS vars (tokeny motywu — te same, które wystawiamy grom), biblioteka `Ui*` (~20 kontrolek, w tym `UiPopup` z focus trapem), `useDropdown`, `usePermission`, transitions (`roll3d` itd.), wzorzec store'ów Pinia z subskrypcjami, testy z `socket-simulator`.

## Znane braki (z analizy hydry)

Brak toast managera (tylko inline `UiMessage`), zero responsywności mobilnej (2 media queries w całym CSS, obie o motywie), brak skali tokenów spacing/typografii, bug persystencji motywu (czyta `hydra-theme`, nigdy nie zapisuje), powielany boilerplate subskrypcji w każdym store (→ `useCollection`).

## Specyfika i ryzyka

Największa praca to nie komponenty, lecz **mobile**: katalog/lobby/czat muszą działać na telefonie, a layout hydry jest desktopowy ze sztywnymi panelami 20/36 rem — zakres mobile w MVP to otwarte pytanie (`UNKNOWNS.md`). Generyczny renderer opcji meczu musi być odporny na złośliwe schematy (limity pól, typów, długości — manifest jest walidowany przy rejestracji, ale defense in depth).

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Wycinka modułów studia (engines/projects/concepts/color-presets: stores, moduły, trasy), fix persystencji motywu | 0 |
| 2 | `useCollection(name, filter)` — generyczne composable subskrypcji; migracja pozostałych store'ów | 1 |
| 3 | Przepływ gościa (wejście z linku, nick tymczasowy) + rejestracja/logowanie (jest w hydrze — dostosowanie) | 2 |
| 4 | Katalog gier, hub gry, pokój przez link, redirect handoff + ekran powrotu z wynikiem i rewanżem | 2 |
| 5 | Lista pokoi, kolejka szybkiego meczu (accept-flow), presence na listach, toast manager, generyczny renderer opcji | 3 |
| 6 | Profil (odznaki, ELO, historia), znajomi, czat (slot `aside`), konwersja gościa | 4 |
| 7 | Panel dewelopera: rejestracja gry, dashboard zaufania (renoma/sprawdzalność, trust_events własne), tokeny | 5 |
| 8 | Panel admina: kolejka moderacji, dossier judge (`audit_cases`), konfiguracja trybu AI | 5 |
| 9 | Przejście mobilne ekranów krytycznych (katalog, pokój, wynik) — zakres wg decyzji z `UNKNOWNS.md` | 3→6 |

**Kryterium „zrobione" dla rdzenia:** dwóch ludzi przechodzi pełną pętlę na telefonach: link → gość → mecz w aplikacji gry → powrót z wynikiem → rewanż.

## Niewiedza lokalna

Zakres mobile w MVP; kształt panelu admina dla dossier (iteracyjnie z judge); czy ekran wyniku pokazuje pełny replay rund (dane są — UI po MVP).
