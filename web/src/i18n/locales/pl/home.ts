// Słownik PL: Home (kafelki gier). Właściciel: Agent D — kontrakt: docs/ETAP3_I18N_CONTRACT.md
export default {
  intro: {
    title: 'Home',
    subtitle: 'Twoje gry i otwarte gry innych — dołącz albo zacznij nową.',
  },
  newGame: 'Nowa gra',
  tile: {
    preparing: 'Przygotowanie…',
    broken: 'Zepsuta',
    waiting: 'Czeka na graczy ({count}/{capacity})',
    inProgress: 'W toku',
    join: 'Dołącz',
    closeGame: 'Zamknij grę',
    /** Etykieta gry zewnętrznej (4d) — UI działa poza platformą. */
    external: 'UI poza platformą',
    quickMatch: 'Szybki mecz',
    quickMatchMeta: 'Gra rankingowa: {game}',
    ranking: 'Ranking gry',
  },
  /** Kolejka szybkiego meczu (4e) — overlay stanu na Home. */
  quick: {
    waitingTitle: 'Szukam przeciwnika…',
    waitingBody: 'W kolejce ({game}) od {seconds} s.',
    cancel: 'Anuluj oczekiwanie',
    proposedTitle: 'Mecz znaleziony!',
    proposedBody: 'Zaakceptuj w ciągu {seconds} s — inaczej wrócisz na koniec kolejki.',
    accept: 'Akceptuj',
    decline: 'Odrzuć',
    matchedTitle: 'Przeciwnik gotowy',
    matchedBody: 'Wchodzę do meczu…',
    errors: {
      join: 'Nie udało się dołączyć do kolejki',
      leave: 'Nie udało się opuścić kolejki',
      accept: 'Nie udało się zaakceptować meczu',
    },
  },
  empty: 'Brak otwartych gier — załóż nową!',
}
