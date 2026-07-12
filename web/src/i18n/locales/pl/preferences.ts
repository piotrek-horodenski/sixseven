// Słownik PL: ekran Preferencje (motyw, język, prefs per gra).
// Właściciel: Agent D — kontrakt: docs/ETAP3_I18N_CONTRACT.md
// `games.*` — klucze wskazywane przez `stores/prefs/game-prefs.catalog.ts`
// (pole `label` katalogu trzyma KLUCZ i18n, tłumaczy PreferencesView).
export default {
  intro: {
    title: 'Preferencje',
    subtitle: 'Motyw, język i ustawienia gier.',
  },
  app: {
    title: 'Aplikacja',
    darkTheme: 'Ciemny motyw',
    language: 'Język',
    languagePlaceholder: 'Wybierz język',
  },
  // Endonimy — celowo identyczne w pl i en (język nazywamy w nim samym).
  languageNames: {
    pl: 'Polski',
    en: 'English',
  },
  games: {
    loading: 'Wczytywanie…',
    rps: {
      title: 'Papier, kamień, nożyce',
      fallbackMove: 'Ruch awaryjny (gdy nie zdążysz zagrać)',
    },
  },
  // Etykiety wartości enum z katalogu prefs (fallback: surowa wartość).
  optionValues: {
    rock: 'Kamień',
    paper: 'Papier',
    scissors: 'Nożyce',
    random: 'Losowy',
  },
  errors: {
    load: 'Nie udało się wczytać preferencji gry',
    save: 'Nie udało się zapisać preferencji gry',
  },
}
