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
  },
  empty: 'No open games — start a new one!',
}

export default home
