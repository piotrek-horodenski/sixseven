# judge — sędzia prawdy

## Rola

Niezależny audytor integralności. Sprawdza, czy gry (i pośrednio deweloperzy) działają zgodnie z kontraktem i nie łamią gwarancji sekretu; prowadzi dossier podejrzeń i wydaje werdykty oparte na dowodach. Osobny mikroserwis, bo audyt ma inny rytm niż silnik meczów: asynchroniczny, z własnym budżetem, z widokiem **między** grami i kontami devów — a jego awaria nie może dotykać rozgrywki.

## Zasada konstytucyjna

**AI wybiera cele, nigdy nie ferruje wyroków.** Targeting (kogo sprawdzić) może być heurystyczny, ręczny albo AI — werdykt (czy winny) zapada wyłącznie na deterministycznym, odtwarzalnym dowodzie dołączonym do `trust_event`. Nie istnieje kara „bo algorytm tak uznał".

## Odpowiedzialności

- **Audyty** (niezapowiedziane, nieodróżnialne od produkcji dla serwisu gry):
  - *replay-audit* — ponowne wysłanie historycznego `/resolve` z `resolve_log`; odpowiedź musi być identyczna bajt w bajt (wykrywa złamany determinizm i cichą podmianę logiki);
  - *test lustrzany* — historyczny stan z zamienionymi graczami musi dać lustrzany wynik (wykrywa faworyzowanie gracza bez znajomości reguł gry);
  - *mecze-pułapki* — platforma gra obiema stronami (bot per gra) przez prawdziwą aplikację UI w instrumentowanej przeglądarce; obserwuje, czy do UI wpływają dane skorelowane z „ukrytymi" ruchami;
  - okresowe kontrakt-testy i health-checki (współdzielony harness z SDK).
- **Targeting:** harmonogram bazowy (częstotliwość odwrotna do zaufania — tabela w `IMPLEMENTATION_PLAN.md`), zlecenia ręczne admina, sygnały heurystyczne (anomalie win-rate, statystyka kontr, wzorce czasowe, grafy powiązanych kont, historia trust_events dewelopera), opcjonalna warstwa AI w trybach **off / assist / auto** (konfiguracja admina; assist = podpowiada z uzasadnieniem, auto = alokuje budżet w limitach).
- **Dossier:** `audit_cases` per gra i per konto deweloperskie — sygnały, zlecone audyty, dowody, werdykty, status. To źródło panelu admina „kto ewentualnie oszukuje".
- **Werdykty:** `trust_events` z dowodem (wejście/wyjście do samodzielnego odtworzenia przez admina i — w wersji zanonimizowanej — do okazania devowi).
- **Detekcja graczy:** statystyka kontr obejmuje też kolaborujących graczy (nie tylko devów) — werdykty wobec kont graczy (kary ELO/ban) tym samym reżimem dowodowym.

## Czego nie robi

Nie prowadzi meczów, nie liczy agregatów zaufania (games; judge tylko emituje zdarzenia), nie moderuje treści (odznaki moderuje registry przy publikacji), nie podejmuje decyzji o unpublish (to skutek progów w games — judge dostarcza zdarzenia, które je przesuwają).

## Interfejsy

Wejście: konfiguracja i zlecenia admina (przez gate/RBAC), odczyt `resolve_log` i statystyk games (read-only, wewnętrzny HTTP lub wspólna baza — rozstrzygnąć w implementacji), odczyt `trust_events`/`matches`/`ratings`. Wyjście: wywołania audytowe → serwisy gier (przez ten sam moduł podpisów co games — nieodróżnialne), `trust_events` + `audit_cases` → baza platformy, headless przeglądarki dla pułapek.

## Specyfika i ryzyka

Nieodróżnialność audytu od produkcji jest wymogiem twardym (inaczej dev serwuje uczciwe odpowiedzi tylko audytom): te same podpisy, te same nagłówki, ruch z tych samych zakresów co games. Pułapki są najdroższe i najsłabsze ogniwo (celowany cheat dla wybranych graczy je omija — to zapisane ograniczenie, nie wada implementacji). Fałszywe pozytywy lustra: gry mogą mieć legalną asymetrię (np. kto zaczyna) — test lustrzany musi respektować deklarację symetrii z manifestu (pole do dodania w SDK przy implementacji).

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Szkielet serwisu + dostęp read-only do `resolve_log` + moduł podpisów współdzielony | 5 |
| 2 | Replay-audit + test lustrzany wg harmonogramu bazowego; werdykty z dowodami do `trust_events` | 5 |
| 3 | `audit_cases` + panel admina (widok dossier, zlecenia ręczne) | 5 |
| 4 | Pułapki dla gier własnych (boty RPS/snajperzy; arrowsoccer w etapie 6) + instrumentacja headless | 5–6 |
| 5 | Sygnały heurystyczne (statystyka kontr, anomalie win-rate) zapisywane do dossier | 5–6 |
| 6 | Warstwa AI: tryb `assist` (podpowiedzi z uzasadnieniem), potem `auto` z limitami budżetu | po stabilizacji sygnałów |

**Kryteria „zrobione" dla rdzenia:** testy S4 (fixtura niedeterministyczna) i S5 (fixtura stronnicza) — judge wykrywa obie, trust spada zgodnie z tabelą, dowód w dossier pozwala odtworzyć naruszenie ręcznie.

## Niewiedza lokalna

Wybór modelu/sygnałów AI i limity trybu auto; deklaracja symetrii gry w manifeście (kształt); jak głęboko instrumentować przeglądarki pułapek (sieć wystarczy vs pełny DOM); kanał dostępu do `resolve_log` (wspólna baza read-only vs API games).
