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
    inviteLabel: 'Invite a guest — share this link:',
    inviteCopy: 'Copy',
    inviteCopied: 'Copied',
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
  // --- Etap 4f: bot-zawodnik ---
  bot: {
    label: 'Bot',
    tooltip: 'Computer player — added because no opponent was available.',
  },
  // --- Etap 4d/4e ---
  ranked: {
    badge: 'Ranked',
  },
  catalog: {
    externalUi: 'UI outside the platform',
    externalWarnTitle: 'You are entering an external game',
    externalWarnBody:
      'You are about to open the developer app "{name}", running outside the platform. The game NEVER asks for your platform password — if it does, close it and report it to us.',
    externalWarnConfirm: 'Got it, play',
    externalWarnCancel: 'Cancel',
  },
  exit: {
    button: 'Leave',
    stay: 'Stay in the game',
    leaving: 'Leaving the game…',
    lobbyHostTitle: 'Close the game?',
    lobbyHostBody: 'You are the host — leaving closes the game and removes it for every player.',
    lobbyHostConfirm: 'Close the game',
    lobbyGuestTitle: 'Leave the lobby?',
    lobbyGuestBody: 'You can return to the game from its tile on the home page.',
    lobbyGuestConfirm: 'Leave',
    casualTitle: 'Leave the match?',
    casualBody:
      'The match continues without you — your moves will be filled in automatically (default move). You can return from the game tile.',
    casualConfirm: 'Leave',
    rankedTitle: 'Forfeit the ranked match?',
    rankedBody: 'This is a walkover — you lose with the full ELO penalty and your opponent gets the win.',
    rankedConfirm: 'Forfeit (walkover)',
  },
  ranking: {
    title: 'Leaderboard: {game}',
    subtitle: 'Top {limit} by ELO',
    loading: 'Loading leaderboard…',
    empty: 'Nobody has played this game ranked yet.',
    position: '#',
    player: 'Player',
    elo: 'ELO',
    matches: 'Matches',
  },
}

export default games
