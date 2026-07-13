import type pl from '../pl/home'

// Słownik EN: Home. Parytet kluczy z pl wymusza typ.
const home: typeof pl = {
  intro: {
    title: 'Home',
    subtitle: 'Your games and open games from others — join one or start a new one.',
  },
  newGame: 'New game',
  tile: {
    preparing: 'Setting up…',
    broken: 'Broken',
    waiting: 'Waiting for players ({count}/{capacity})',
    inProgress: 'In progress',
    join: 'Join',
    closeGame: 'Close game',
    /** Etykieta gry zewnętrznej (4d) — UI działa poza platformą. */
    external: 'UI outside the platform',
    quickMatch: 'Quick match',
    quickMatchMeta: 'Ranked game: {game}',
    ranking: 'Leaderboard',
  },
  /** Kolejka szybkiego meczu (4e) — overlay stanu na Home. */
  quick: {
    waitingTitle: 'Looking for an opponent…',
    waitingBody: 'In queue ({game}) for {seconds} s.',
    cancel: 'Cancel waiting',
    proposedTitle: 'Match found!',
    proposedBody: 'Accept within {seconds} s — otherwise you go back to the end of the queue.',
    accept: 'Accept',
    decline: 'Decline',
    matchedTitle: 'Opponent ready',
    matchedBody: 'Entering the match…',
    errors: {
      join: 'Could not join the queue',
      leave: 'Could not leave the queue',
      accept: 'Could not accept the match',
    },
  },
  empty: 'No open games — start a new one!',
}

export default home
