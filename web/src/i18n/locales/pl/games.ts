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
    inviteLabel: 'Zaproś gościa — wyślij link:',
    inviteCopy: 'Kopiuj',
    inviteCopied: 'Skopiowano',
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
  // --- Etap 4f: bot-zawodnik ---
  bot: {
    label: 'Bot',
    tooltip: 'Gracz komputerowy — dosadzony, bo brakowało przeciwnika.',
  },
  // --- Etap 4d/4e ---
  ranked: {
    badge: 'Rankingowy',
  },
  catalog: {
    externalUi: 'UI poza platformą',
    externalWarnTitle: 'Przechodzisz do gry zewnętrznej',
    externalWarnBody:
      'Za chwilę otworzysz aplikację dewelopera „{name}", działającą poza platformą. Gra NIGDY nie prosi o hasło platformy — jeśli poprosi, zamknij ją i zgłoś nam to.',
    externalWarnConfirm: 'Rozumiem, graj',
    externalWarnCancel: 'Anuluj',
  },
  exit: {
    button: 'Wyjdź',
    stay: 'Zostań w grze',
    leaving: 'Wychodzę z gry…',
    lobbyHostTitle: 'Zamknąć grę?',
    lobbyHostBody: 'Jesteś hostem — wyjście zamknie grę i usunie ją wszystkim graczom.',
    lobbyHostConfirm: 'Zamknij grę',
    lobbyGuestTitle: 'Wyjść z poczekalni?',
    lobbyGuestBody: 'Możesz wrócić do gry z kafelka na stronie głównej.',
    lobbyGuestConfirm: 'Wyjdź',
    casualTitle: 'Wyjść z meczu?',
    casualBody:
      'Mecz będzie kontynuowany bez Ciebie — Twoje ruchy będą uzupełniane automatycznie (ruch domyślny). Możesz wrócić z kafelka gry.',
    casualConfirm: 'Wyjdź',
    rankedTitle: 'Poddać mecz rankingowy?',
    rankedBody: 'To walkower — przegrywasz z pełną karą ELO, a przeciwnik dostaje wygraną.',
    rankedConfirm: 'Poddaję (walkower)',
  },
  ranking: {
    title: 'Ranking: {game}',
    subtitle: 'Top {limit} wg ELO',
    loading: 'Ładuję ranking…',
    empty: 'Nikt jeszcze nie zagrał rankingowo w tę grę.',
    position: '#',
    player: 'Gracz',
    elo: 'ELO',
    matches: 'Mecze',
  },
}
