// Słownik PL: tworzenie gry (/new), dołączanie z linku (/r/:code), rooms.store.
// Właściciel: Agent D — kontrakt: docs/ETAP3_I18N_CONTRACT.md
export default {
  intro: {
    title: 'Nowa gra',
    subtitle: 'Wybierz grę i utwórz — wylądujesz od razu na ekranie gry.',
  },
  create: {
    title: 'Nowa gra',
    gameLabel: 'Gra',
    gameRps: 'Papier / kamień / nożyce',
    onlyOneGameHint: 'Na razie jedna gra — więcej wkrótce.',
    capacityLabel: 'Liczba graczy',
    capacityHint: 'Min. 2, bez twardego limitu.',
    targetLabel: 'Do ilu punktów',
    submit: 'Utwórz',
    /** Domyślna nazwa gry zapisywana na serwerze (widoczna dla wszystkich graczy). */
    defaultName: 'Gra {author}',
    defaultNameFallback: 'Gra gracza',
  },
  join: {
    title: 'Dołącz do gry',
    invited: 'Zaproszono Cię do gry {code}. Podaj nick, żeby zagrać.',
    nickLabel: 'Nick',
    nickPlaceholder: 'Twój nick',
    joinAsGuest: 'Dołącz jako gość',
    haveAccount: 'Masz konto? Zaloguj się',
    joining: 'Dołączam do gry {code}…',
    failedTitle: 'Nie udało się dołączyć',
    toHome: 'Do Home',
    gameCode: 'Kod gry: {code}',
    hostBadge: 'host',
    guestBadge: 'gość',
    retry: 'Spróbuj ponownie',
    connecting: 'Łączę z grą…',
    loading: 'Ładuję grę…',
  },
  errors: {
    create: 'Nie udało się utworzyć gry',
    join: 'Nie udało się dołączyć do gry',
    close: 'Nie udało się zamknąć gry',
    handoff: 'Nie udało się przejść do meczu',
  },
}
