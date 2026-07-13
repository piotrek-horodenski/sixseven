import type pl from '../pl/community'

// Namespace `community` — parytet kluczy z pl wymusza typ.
// WŁAŚCICIEL: Agent A5. Kontrakt: docs/ETAP4_ABC_CONTRACT.md
const community: typeof pl = {
  chat: {
    title: 'Chat',
    placeholder: 'Type a message…',
    send: 'Send',
    empty: 'No messages yet. Start the conversation.',
    noScope: 'Chat is unavailable in this view.',
    tooLong: 'Message is too long (max {max} characters).',
    rateLimited: 'Slow down — too many messages. Try again shortly.',
    sendFailed: 'Could not send the message.',
  },
  profile: {
    loading: 'Loading profile…',
    loadFailed: 'Could not load the profile.',
    history: 'History',
    historyEmpty: 'No matches played yet.',
    game: 'Game',
    played: 'Played',
    wins: 'Wins',
    losses: 'Losses',
    draws: 'Draws',
    recent: 'Recent matches',
    recentEmpty: 'No recent matches.',
    badges: 'Badges',
    badgesEmpty: 'No badges yet.',
    result: {
      win: 'Win',
      loss: 'Loss',
      draw: 'Draw',
    },
    /** Sekcja ELO (4e) — subskrypcja `ratings` po userId. */
    elo: 'Rating (ELO)',
    eloEmpty: 'No ranked matches played yet.',
    eloGame: 'Game',
    eloRating: 'ELO',
    eloMatches: 'Matches',
    eloRankingLink: 'See leaderboard',
  },
  /**
   * Etykiety odznak per `badgeId` — parytet kluczy z pl wymusza typ;
   * fallback na surowe badgeId w komponencie.
   */
  badges: {
    flawless: 'Flawless',
    'mind-reader': 'Mind reader',
  },
  guest: {
    title: 'Create an account',
    cta: 'Create an account, keep your results',
    subtitle: 'Keep your results and keep playing as a signed-in player.',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    submit: 'Create account and keep results',
    success: 'Account created. Taking you to the app…',
    haveAccount: 'Already have an account? Log in',
    noSession: 'No active guest session. Open the game from a room link.',
    toHome: 'Back to home',
    errors: {
      failed: 'Could not create the account.',
    },
  },
}

export default community
