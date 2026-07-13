// Namespace `dev` (Etap 4d) — widok „Moje gry" dewelopera (/dev): CTA enroll,
// formularz rejestracji/edycji gry, sekret HMAC (pokazany RAZ), lista gier.
// Kontrakt: docs/ETAP4_DE_CONTRACT.md §4.
export default {
  intro: {
    title: 'Dla deweloperów',
    subtitle: 'Rejestruj własne gry i wystawiaj je w katalogu platformy.',
  },
  enroll: {
    title: 'Zostań deweloperem',
    body: 'Konto dewelopera pozwala rejestrować własne gry zewnętrzne (limit 5 na konto). Rola nadawana jest od ręki — bez weryfikacji.',
    cta: 'Zostań deweloperem',
  },
  form: {
    createTitle: 'Zarejestruj nową grę',
    editTitle: 'Edytujesz grę „{gameId}"',
    editWarning:
      'Zapisanie zmian cofa grę do statusu „oczekuje" — zniknie z katalogu do ponownego zatwierdzenia przez administratora.',
    gameId: 'Identyfikator gry (slug)',
    gameIdHint: '3–32 znaki: małe litery, cyfry, myślniki. Po rejestracji bez zmian.',
    name: 'Nazwa gry',
    serviceUrl: 'Adres serwisu gry (serviceUrl)',
    uiUrl: 'Adres UI gry (uiUrl)',
    urlHint: 'Pełne adresy http(s) — serwis liczy rundy, UI gra w przeglądarce.',
    version: 'Wersja (semver)',
    minPlayers: 'Min. graczy',
    maxPlayers: 'Maks. graczy',
    planningPhaseMs: 'Czas rundy (ms)',
    planningPhaseHint: 'Minimum 2000 ms.',
    submitCreate: 'Zarejestruj grę',
    submitEdit: 'Zapisz zmiany',
    cancelEdit: 'Anuluj edycję',
    errors: {
      required: 'Uzupełnij wszystkie wymagane pola.',
      gameIdFormat: 'Identyfikator: 3–32 znaki (małe litery, cyfry, myślniki).',
      url: 'serviceUrl i uiUrl muszą być poprawnymi adresami http(s).',
      players: 'Min. graczy ≥ 2, maks. graczy ≥ min.',
      planning: 'Czas rundy to co najmniej 2000 ms.',
      version: 'Podaj wersję w formacie semver, np. 1.0.0.',
    },
  },
  secret: {
    title: 'Sekret HMAC — zapisz go TERAZ',
    body: 'Ten sekret podpisuje komunikację platformy z Twoim serwisem gry. Widzisz go TYLKO TEN JEDEN RAZ — nie da się go później odczytać.',
    label: 'Sekret dla gry „{gameId}":',
    done: 'Zapisałem sekret',
  },
  list: {
    title: 'Moje gry',
    empty: 'Nie masz jeszcze zarejestrowanych gier.',
    version: 'Wersja',
    players: 'Gracze',
    edit: 'Edytuj',
    statuses: {
      registered: 'oczekuje na zatwierdzenie',
      published: 'opublikowana',
      unpublished: 'wycofana',
    },
  },
  errors: {
    enrollFailed: 'Nie udało się nadać roli dewelopera.',
    registerFailed: 'Nie udało się zarejestrować gry.',
    updateFailed: 'Nie udało się zapisać zmian.',
  },
}
