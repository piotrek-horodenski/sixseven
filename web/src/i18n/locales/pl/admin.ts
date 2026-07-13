// Wypełnia Agent B — kontrakt: docs/ETAP3_I18N_CONTRACT.md
export default {
  breadcrumbRoot: 'Administracja',
  users: 'Użytkownicy',
  roles: 'Role',
  settings: 'Ustawienia',

  // Lista użytkowników
  searchUsers: 'Szukaj użytkowników…',
  sync: 'Synchronizuj',
  username: 'Nazwa użytkownika',
  email: 'E-mail',
  none: 'brak',
  remove: 'Usuń',
  noUserMatches: 'Żaden użytkownik nie spełnia podanych kryteriów',
  confirm: 'Potwierdź',
  confirmDeleteUser: 'Czy na pewno chcesz usunąć tego użytkownika?',
  yesDelete: 'Tak, usuń',

  // Lista ról
  searchRoles: 'Szukaj ról…',
  newRole: 'Nowa rola',
  role: 'Rola',
  permissions: 'Uprawnienia',
  inherits: 'Dziedziczy',
  noRoleMatches: 'Żadna rola nie spełnia podanych kryteriów',
  confirmDeleteRole: 'Czy na pewno chcesz usunąć tę rolę?',

  // Panel edycji roli
  editRole: 'Edytuj rolę',
  create: 'Utwórz',
  name: 'Nazwa',
  display: 'Wyświetlana nazwa',
  roleNamePlaceholder: 'nazwa-roli',
  displayNamePlaceholder: 'Wyświetlana nazwa',
  directPermissions: 'Uprawnienia bezpośrednie',
  inheritFromRoles: 'Dziedzicz z ról',
  effectivePermissions: 'Uprawnienia efektywne',
  noPermissions: 'Brak uprawnień',
  inherited: 'odziedziczone',

  // Panel edycji użytkownika
  editUserRoles: 'Edytuj role użytkownika',
  displayName: 'Wyświetlana nazwa',
  inheritedRoles: 'Odziedziczone role',
  userNotFound: 'Nie znaleziono użytkownika',

  // Moderacja katalogu gier (4d)
  games: 'Gry',
  gamesIntro: 'Zatwierdzanie gier zewnętrznych',
  gamesPendingTitle: 'Oczekujące na zatwierdzenie',
  gamesAllTitle: 'Wszystkie gry zewnętrzne',
  gameName: 'Nazwa',
  gameSlug: 'Identyfikator',
  gameDev: 'Deweloper',
  gameStatus: 'Status',
  gameVersion: 'Wersja',
  gameUiUrl: 'UI',
  approve: 'Zatwierdź',
  unpublish: 'Wycofaj',
  noPendingGames: 'Brak gier oczekujących na zatwierdzenie.',
  noExternalGames: 'Brak zarejestrowanych gier zewnętrznych.',
  gameStatuses: {
    registered: 'oczekuje',
    published: 'opublikowana',
    unpublished: 'wycofana',
  },
}
