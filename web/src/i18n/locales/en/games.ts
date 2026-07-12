import type pl from '../pl/games'

// Namespace `games` — parytet kluczy z pl wymusza typ.
// WŁAŚCICIEL: Agent C. Kontrakt: docs/ETAP3_I18N_CONTRACT.md
const games: typeof pl = {
  you: 'You',
  connecting: 'Connecting to the match…',
  loadingMatch: 'Loading match…',
  back: 'Back',
  /** Cel punktowy meczu, np. „first to 5". */
  scoreTarget: 'first to {target}',
  moves: {
    rock: 'Rock',
    paper: 'Paper',
    scissors: 'Scissors',
  },
  phase: {
    lobby: 'Ready to start',
    planning: 'Round in progress',
    resolving: 'Resolving',
    revealing: 'Reveal',
    paused: 'Paused',
    finished: 'Finished',
    cancelled: 'Cancelled',
  },
  hand: {
    defaulted: '(auto)',
  },
  lobby: {
    waitingTitle: 'Waiting for players ({count}/{capacity})',
    waitingBody: 'The RPS game to {target} pts starts once all players have joined.',
    emptySlot: 'Open slot',
    readyTitle: 'Match ready',
    readyBody: '{count} players, first to {target} pts.',
    start: 'Start',
    waitingForOthers: 'Waiting for the others to start…',
    ready: 'ready',
    autoStart: 'The game starts automatically in {seconds}s',
  },
  planning: {
    prompt: 'Round {round} — pick your move',
    rejected: 'Move rejected — pick again.',
    waitingForOthers: 'Move locked in. Waiting for the others ({ready}/{total})…',
    othersReady: 'Everyone else has picked',
    othersProgress: 'Others have picked: {ready}/{total}',
  },
  resolving: 'Resolving the round…',
  reveal: {
    win: 'You win the round!',
    lose: 'You lose points this round',
    draw: 'The round is a draw',
  },
  finished: {
    win: 'You won!',
    lose: 'You lost',
    draw: 'Draw',
  },
  paused: {
    title: 'Paused',
    body: 'The game service is temporarily unavailable. Trying to resume automatically…',
  },
  cancelled: {
    title: 'Match cancelled',
    lobby: 'Nobody started the match in time.',
    paused: 'The match was cancelled after too long a pause (the game service was not responding).',
    walkover: 'Walkover.',
    default: 'The match was cancelled.',
  },
  errors: {
    missingHandoff: 'Missing handoff code in the URL — open the game from a room.',
    joinFailedTitle: 'Could not enter the game',
    joinFailed: 'Could not join the match',
    createFailed: 'Could not create the match',
    operationFailed: 'Operation failed',
  },
}

export default games
