# Jak działa sixseven

Przewodnik po działaniu platformy — bez szczegółów implementacyjnych (te są w `ARCHITECTURE.md` i `IMPLEMENTATION_PLAN.md`).

## Idea w trzech zdaniach

Każda gra na sixseven działa w tym samym rytmie: wszyscy gracze **równocześnie i w tajemnicy** planują ruch (np. 30 sekund), potem następuje wspólne ujawnienie i rozstrzygnięcie rundy. Platforma jest **powiernikiem sekretu** — gwarantuje, że zaplanowanego ruchu nie pozna przed czasem ani przeciwnik, ani nawet twórca gry. Gry tworzą niezależni deweloperzy; sixseven prowadzi mecze, dobiera przeciwników i utrzymuje społeczność.

## Mecz od środka

1. **Znalezienie przeciwników** — trzy drogi: szybki mecz (kolejka, dobór wg rankingu), pokój publiczny z listy, pokój prywatny z linku/kodu (`sixseven.gg/r/AB3X`). Host pokoju wybiera wariant gry (preset + opcje, np. fizykę w arrowsoccer).
2. **Przekierowanie do gry** — gra to osobna aplikacja (twórcy gry). Platforma przekazuje ją z jednorazowym kodem; aplikacja wymienia go na token ważny tylko dla tego meczu i tego gracza.
3. **Rundy** — faza planowania (ruch można zmieniać do końca fazy; przeciwnik widzi tylko „gotowy"), rozstrzygnięcie u logiki gry, reveal. Gry z animowanym reveal (np. symulacja fizyki) czekają, aż wszyscy klienci odtworzą animację.
4. **Brak ruchu / rozłączenie** — gra podstawia ruch domyślny; mecz się nie zatrzymuje. Porzucenie meczu rankingowego = walkower i kara w rankingu.
5. **Koniec** — powrót na platformę: ekran wyniku, rewanż, historia rund. Gra może przyznać graczom odznaki z puli zatwierdzonej przy publikacji (pozytywne widzą wszyscy, pozostałe tylko właściciel).

## Gwarancja sekretu — co dokładnie obiecujemy

- **Wobec przeciwnika:** treść Twojego ruchu nie istnieje nigdzie, skąd mógłby ją odczytać — ani w API, ani w subskrypcjach; nawet sygnał „gotowy" jest wysyłany tak, by nie zdradzać niczego czasem reakcji.
- **Wobec twórcy gry:** serwis logiki gry otrzymuje ruchy dopiero po zamknięciu fazy planowania (nie może już nic nikomu podpowiedzieć). W grach wbudowanych (tworzonych przez platformę) frontend jest częścią naszej aplikacji — i tylko te gry grają rankingowo.
- **Czego nie obiecujemy:** gry zewnętrzne mają frontend hostowany przez dewelopera („UI poza platformą" — widoczna etykieta) i grają wyłącznie mecze towarzyskie. Tu gwarancja wobec twórcy gry opiera się na **wykrywaniu i karach** (audyty sędziego, mecze-pułapki, zgłoszenia graczy, utrata renomy do zdjęcia z katalogu włącznie), nie na technicznej blokadzie. Obietnica brzmi: „wykrywamy i karzemy", nie „wyciek niemożliwy".

## Zaufanie — waluta deweloperów

Każda gra ma dwie publiczne miary w katalogu:

- **Renoma** (start 100%) — spada tylko przy działaniu wbrew integralności platformy. Odbudowuje się powoli i po incydencie nigdy do pełna.
- **Sprawdzalność** (start 0%) — rośnie z każdą spójną odpowiedzią i uczciwie rozegranym meczem; incydenty też ją podnoszą, bo są wiedzą.

Zaufanie kupuje przywileje: wyższy limit równoczesnych meczów, publikacje wersji bez ręcznej moderacji, wyróżnienie „sprawdzona". Nowa gra jest „niewinna, ale niesprawdzona"; gra po aferze — „znana i skompromitowana", co jest gorsze. Konto dewelopera dziedziczy reputację: oszust nie zresetuje się nową grą.

Nad integralnością czuwa **judge — sędzia prawdy**: niezapowiedziane audyty nieodróżnialne od zwykłego ruchu (powtórzenie historycznej rundy musi dać identyczny wynik; stan lustrzany musi dać lustrzany wynik; mecze-pułapki, w których platforma zna obie strony). Cele audytów wybierają heurystyki, admin lub — konfigurowalnie — AI; **werdykty zapadają wyłącznie na twardych dowodach**.

## Konta i goście

- **Konto gracza:** profil, znajomi, presence, historia meczów, ELO per gra (ranking tylko na domyślnym wariancie gry), odznaki.
- **Gość:** wejście z linku do pokoju bez rejestracji — tymczasowy nick, tylko mecze towarzyskie. Po meczu można założyć konto i zachować wyniki z ostatnich dni.
- **Konto dewelopera:** rejestracja gier, tokeny API, dashboard zaufania. Szczegóły: `GAME_DEV_GUIDE.md`.

## Czego platforma świadomie nie robi

- **Nie jest silnikiem real-time** — minimalny czas fazy planowania to 2 s; napięcie budują tajne decyzje, nie refleks.
- **Nie wykonuje kodu gier** — logika i frontend gry zewnętrznej żyją w całości na infrastrukturze dewelopera; dlatego gry zewnętrzne nie grają rankingowo.
- **Nie pozwala grze prosić o hasło** — cała autoryzacja gry płynie z platformy; formularz logowania w grze to sygnał oszustwa.
- **Nie ocenia gier algorytmem bez dowodu** — AI może wskazywać, komu się przyjrzeć; kary wymagają odtwarzalnego dowodu.

Rejestr rzeczy, których jeszcze **nie wiemy**: `UNKNOWNS.md`.
