# photos — media platformy

## Rola

Przechowywanie i serwowanie obrazków: avatary graczy, thumbnaile i grafiki gier w katalogu. Serwis pomocniczy — świadomie nudny. W modelu sekretu nie uczestniczy (nie przyjmuje żadnych danych meczowych); jego jedyny obowiązek wobec bezpieczeństwa to nie być wektorem ataku (upload!).

## Odpowiedzialności

- Upload obrazków (multer), generowanie thumbów/preview (Sharp), tagi/kolekcje, soft-delete.
- Avatary użytkowników (powiązanie po userId, podmiana, domyślne).
- Grafiki gier: thumbnail z manifestu trafia tu podczas rejestracji gry (registry uploaduje po zatwierdzeniu moderacji).

## Czego nie robi

Nie hostuje bundli UI gier (to osobny, statyczny hosting z CSP przy games/registry — inne wymagania nagłówków i cache). Nie przetwarza niczego poza obrazkami.

## Stan zastany (image z hydry) i specyfika

Serwis istnieje (rodowód: zewnętrzny starter galerii): Express 4, własne osobne Mongo (bez replica set — dla obrazków OK), pliki na dysku (wolumen), auth przez współdzielony `JWT_SECRET`. Ryzyka do przeglądu: **ownership/IDOR na mutacjach** (historyczna luka wymieniana w planach hydry — zweryfikować), walidacja typów plików i limitów rozmiaru, brak skanowania metadanych (EXIF strip dla prywatności avatarów).

## Plan implementacji

| Krok | Zakres | Etap |
|---|---|---|
| 1 | Rotacja sekretu (env-required), przegląd ownership/IDOR na wszystkich mutacjach, limity rozmiaru/typów | 0 |
| 2 | EXIF strip przy uploadzie avatarów; domyślne avatary | 2 |
| 3 | Integracja z registry: upload thumbnaila gry w pipeline rejestracji | 5 |
| 4 | (opcjonalnie, gdy zajdzie potrzeba) wspólny replica set / S3-kompatybilny storage | po MVP |

**Kryterium „zrobione":** użytkownik A nie może zmodyfikować/usunąć obrazka użytkownika B (test); upload nie przyjmuje plików nie-obrazkowych.

## Niewiedza lokalna

Czy zostaje na osobnym Mongo (dziś: tak, wystarcza); storage plików przy skalowaniu (dysk → S3) — po MVP.
