// Namespace `games` — ekran gry RPS, konsty gry, komunikaty klienta meczu.
// WŁAŚCICIEL: Agent C. Kontrakt: docs/ETAP3_I18N_CONTRACT.md
export default {
  you: 'Ty',
  connecting: 'Łączę z meczem…',
  loadingMatch: 'Ładuję mecz…',
  back: 'Powrót',
  /** Cel punktowy meczu, np. „do 5". */
  scoreTarget: 'do {target}',
  moves: {
    rock: 'Kamień',
    paper: 'Papier',
    scissors: 'Nożyce',
  },
  phase: {
    lobby: 'Gotowy do startu',
    planning: 'Trwa runda',
    resolving: 'Rozstrzyganie',
    revealing: 'Odsłona',
    paused: 'Wstrzymany',
    finished: 'Zakończony',
    cancelled: 'Anulowany',
  },
  hand: {
    defaulted: '(auto)',
  },
  lobby: {
    waitingTitle: 'Czekam na graczy ({count}/{capacity})',
    waitingBody: 'Gra RPS do {target} pkt ruszy, gdy dołączy komplet graczy.',
    emptySlot: 'Wolne miejsce',
    readyTitle: 'Mecz gotowy',
    readyBody: 'Gracie w {count} do {target} pkt.',
    start: 'Rozpocznij',
    waitingForOthers: 'Czekam aż pozostali rozpoczną…',
    ready: 'gotowy',
    autoStart: 'Gra ruszy automatycznie za {seconds}s',
  },
  planning: {
    prompt: 'Runda {round} — wybierz ruch',
    rejected: 'Ruch odrzucony — wybierz jeszcze raz.',
    waitingForOthers: 'Ruch złożony. Czekam na pozostałych ({ready}/{total})…',
    othersReady: 'Pozostali już wybrali',
    othersProgress: 'Pozostali wybrali: {ready}/{total}',
  },
  resolving: 'Rozstrzygam rundę…',
  reveal: {
    win: 'Wygrywasz rundę!',
    lose: 'Tracisz punkty w tej rundzie',
    draw: 'Remis w rundzie',
  },
  finished: {
    win: 'Wygrałeś!',
    lose: 'Przegrałeś',
    draw: 'Remis',
  },
  paused: {
    title: 'Wstrzymano',
    body: 'Serwis gry chwilowo nie odpowiada. Próbuję wznowić automatycznie…',
  },
  cancelled: {
    title: 'Mecz anulowany',
    lobby: 'Nikt nie wystartował meczu na czas.',
    paused: 'Mecz anulowano po zbyt długiej przerwie (serwis gry nie odpowiadał).',
    walkover: 'Walkower.',
    default: 'Mecz został anulowany.',
  },
  errors: {
    missingHandoff: 'Brak kodu handoffu w adresie — otwórz grę z pokoju.',
    joinFailedTitle: 'Nie udało się wejść do gry',
    joinFailed: 'Nie udało się dołączyć do meczu',
    createFailed: 'Nie udało się utworzyć meczu',
    operationFailed: 'Operacja nie powiodła się',
  },
}
