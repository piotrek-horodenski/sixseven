import type pl from '../pl/rooms'

// Słownik EN: rooms. Parytet kluczy z pl wymusza typ.
const rooms: typeof pl = {
  intro: {
    title: 'New game',
    subtitle: "Pick a game and create it — you'll land straight on the game screen.",
  },
  create: {
    title: 'New game',
    gameLabel: 'Game',
    gameRps: 'Rock / paper / scissors',
    onlyOneGameHint: 'Just one game for now — more coming soon.',
    capacityLabel: 'Number of players',
    capacityHint: 'Min. 2, no hard limit.',
    targetLabel: 'Points to win',
    submit: 'Create',
    defaultName: "{author}'s game",
    defaultNameFallback: "Player's game",
  },
  join: {
    title: 'Join the game',
    invited: "You've been invited to game {code}. Enter a nickname to play.",
    nickLabel: 'Nickname',
    nickPlaceholder: 'Your nickname',
    joinAsGuest: 'Join as a guest',
    haveAccount: 'Have an account? Log in',
    joining: 'Joining game {code}…',
    failedTitle: 'Could not join',
    toHome: 'Back to Home',
    gameCode: 'Game code: {code}',
    hostBadge: 'host',
    guestBadge: 'guest',
    retry: 'Try again',
    connecting: 'Connecting to the game…',
    loading: 'Loading the game…',
  },
  errors: {
    create: 'Could not create the game',
    join: 'Could not join the game',
    close: 'Could not close the game',
    handoff: 'Could not enter the match',
  },
}

export default rooms
