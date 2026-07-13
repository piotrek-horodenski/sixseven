import type pl from '../pl/dev'

// Namespace `dev` (Etap 4d) — parytet kluczy z pl wymusza typ.
// Kontrakt: docs/ETAP4_DE_CONTRACT.md §4.
const dev: typeof pl = {
  intro: {
    title: 'For developers',
    subtitle: 'Register your own games and publish them in the platform catalog.',
  },
  enroll: {
    title: 'Become a developer',
    body: 'A developer account lets you register your own external games (limit of 5 per account). The role is granted instantly — no verification.',
    cta: 'Become a developer',
  },
  form: {
    createTitle: 'Register a new game',
    editTitle: 'Editing game "{gameId}"',
    editWarning:
      'Saving changes reverts the game to "pending" — it disappears from the catalog until an administrator approves it again.',
    gameId: 'Game id (slug)',
    gameIdHint: '3–32 chars: lowercase letters, digits, hyphens. Immutable after registration.',
    name: 'Game name',
    serviceUrl: 'Game service URL (serviceUrl)',
    uiUrl: 'Game UI URL (uiUrl)',
    urlHint: 'Full http(s) URLs — the service resolves rounds, the UI plays in the browser.',
    version: 'Version (semver)',
    minPlayers: 'Min players',
    maxPlayers: 'Max players',
    planningPhaseMs: 'Round time (ms)',
    planningPhaseHint: 'At least 2000 ms.',
    submitCreate: 'Register game',
    submitEdit: 'Save changes',
    cancelEdit: 'Cancel editing',
    errors: {
      required: 'Fill in all required fields.',
      gameIdFormat: 'Id: 3–32 chars (lowercase letters, digits, hyphens).',
      url: 'serviceUrl and uiUrl must be valid http(s) URLs.',
      players: 'Min players ≥ 2, max players ≥ min.',
      planning: 'Round time is at least 2000 ms.',
      version: 'Provide a semver version, e.g. 1.0.0.',
    },
  },
  secret: {
    title: 'HMAC secret — save it NOW',
    body: 'This secret signs the communication between the platform and your game service. You see it ONLY THIS ONE TIME — it cannot be read again later.',
    label: 'Secret for game "{gameId}":',
    done: 'I saved the secret',
  },
  list: {
    title: 'My games',
    empty: 'You have no registered games yet.',
    version: 'Version',
    players: 'Players',
    edit: 'Edit',
    statuses: {
      registered: 'pending approval',
      published: 'published',
      unpublished: 'unpublished',
    },
  },
  errors: {
    enrollFailed: 'Could not grant the developer role.',
    registerFailed: 'Could not register the game.',
    updateFailed: 'Could not save the changes.',
  },
}

export default dev
