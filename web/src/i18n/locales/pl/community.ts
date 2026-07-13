// Namespace `community` (Etap 4b/4c) — czat, publiczny profil gracza,
// odznaki (adnotacje) i konwersja gościa. WŁAŚCICIEL: Agent A5.
// Kontrakt: docs/ETAP4_ABC_CONTRACT.md
export default {
  chat: {
    title: 'Czat',
    placeholder: 'Napisz wiadomość…',
    send: 'Wyślij',
    empty: 'Brak wiadomości. Zacznij rozmowę.',
    noScope: 'Czat niedostępny w tym widoku.',
    tooLong: 'Wiadomość jest za długa (maks. {max} znaków).',
    rateLimited: 'Zwolnij — zbyt wiele wiadomości. Spróbuj za chwilę.',
    sendFailed: 'Nie udało się wysłać wiadomości.',
  },
  profile: {
    loading: 'Ładuję profil…',
    loadFailed: 'Nie udało się wczytać profilu.',
    history: 'Historia',
    historyEmpty: 'Brak rozegranych meczów.',
    game: 'Gra',
    played: 'Rozegrane',
    wins: 'Wygrane',
    losses: 'Przegrane',
    draws: 'Remisy',
    recent: 'Ostatnie mecze',
    recentEmpty: 'Brak ostatnich meczów.',
    badges: 'Odznaki',
    badgesEmpty: 'Brak odznak.',
    result: {
      win: 'Wygrana',
      loss: 'Przegrana',
      draw: 'Remis',
    },
    /** Sekcja ELO (4e) — subskrypcja `ratings` po userId. */
    elo: 'Ranking (ELO)',
    eloEmpty: 'Brak rozegranych meczów rankingowych.',
    eloGame: 'Gra',
    eloRating: 'ELO',
    eloMatches: 'Mecze',
    eloRankingLink: 'Zobacz ranking',
  },
  /**
   * Etykiety odznak per `badgeId` (fix z backlogu): klucz
   * `community.badges.<badgeId>`, fallback na surowe badgeId w komponencie.
   * Identyfikatory z manifestu RPS (catalog/rps).
   */
  badges: {
    flawless: 'Bez skazy',
    'mind-reader': 'Czytający w myślach',
  },
  guest: {
    title: 'Załóż konto',
    cta: 'Załóż konto, zachowaj wyniki',
    subtitle: 'Zachowaj swoje wyniki i graj dalej jako zalogowany gracz.',
    username: 'Nazwa użytkownika',
    email: 'E-mail',
    password: 'Hasło',
    submit: 'Załóż konto i zachowaj wyniki',
    success: 'Konto założone. Przenoszę Cię do aplikacji…',
    haveAccount: 'Masz już konto? Zaloguj się',
    noSession: 'Brak aktywnej sesji gościa. Otwórz grę z linku pokoju.',
    toHome: 'Wróć na stronę główną',
    errors: {
      failed: 'Nie udało się założyć konta.',
    },
  },
}
