import type pl from '../pl/social'

// Namespace `social` — parytet kluczy z pl wymusza typ.
// OBSZAR A4 (Etap 4a). Kontrakt: docs/ETAP4_ABC_CONTRACT.md
const social: typeof pl = {
  panel: {
    title: 'Friends',
    addPlaceholder: 'Player name or ID',
    empty: 'You have no friends yet. Invite someone by name or ID.',
  },
  invites: {
    title: 'Invitations',
    outgoingTitle: 'Sent invitations',
    pending: 'Pending',
  },
  status: {
    online: 'Online',
    lobby: 'In lobby',
    match: 'In game',
    offline: 'Offline',
  },
  actions: {
    invite: 'Invite',
    accept: 'Accept',
    reject: 'Reject',
    remove: 'Remove',
  },
  privacy: {
    invisible: 'Invisible mode',
    invisibleHint: 'Friends see you as “online”, without match details.',
  },
  errors: {
    invite: 'Could not send the invitation',
    accept: 'Could not accept the invitation',
    remove: 'Could not remove the friend',
    privacy: 'Could not change invisible mode',
  },
}

export default social
