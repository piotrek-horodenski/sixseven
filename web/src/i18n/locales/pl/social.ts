// Namespace `social` — panel znajomych, statusy obecności, tryb niewidzialny.
// OBSZAR A4 (Etap 4a). Kontrakt: docs/ETAP4_ABC_CONTRACT.md
export default {
  panel: {
    title: 'Znajomi',
    addPlaceholder: 'Nazwa lub ID gracza',
    empty: 'Nie masz jeszcze znajomych. Zaproś kogoś po nazwie lub ID.',
  },
  invites: {
    title: 'Zaproszenia',
    outgoingTitle: 'Wysłane zaproszenia',
    pending: 'Oczekuje',
  },
  status: {
    online: 'Dostępny',
    lobby: 'W poczekalni',
    match: 'W grze',
    offline: 'Niedostępny',
  },
  actions: {
    invite: 'Zaproś',
    accept: 'Przyjmij',
    reject: 'Odrzuć',
    remove: 'Usuń',
    message: 'Napisz wiadomość',
    profile: 'Zobacz profil',
  },
  privacy: {
    invisible: 'Tryb niewidzialny',
    invisibleHint: 'Znajomi widzą Cię jako „dostępny", bez szczegółów rozgrywki.',
  },
  errors: {
    invite: 'Nie udało się wysłać zaproszenia',
    accept: 'Nie udało się przyjąć zaproszenia',
    remove: 'Nie udało się usunąć znajomego',
    privacy: 'Nie udało się zmienić trybu niewidzialnego',
  },
}
