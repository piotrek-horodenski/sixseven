import type pl from '../pl/preferences'

// Słownik EN: preferences. Parytet kluczy z pl wymusza typ.
const preferences: typeof pl = {
  intro: {
    title: 'Preferences',
    subtitle: 'Theme, language and game settings.',
  },
  app: {
    title: 'Application',
    darkTheme: 'Dark theme',
    language: 'Language',
    languagePlaceholder: 'Choose a language',
  },
  // Endonimy — celowo identyczne w pl i en.
  languageNames: {
    pl: 'Polski',
    en: 'English',
  },
  games: {
    loading: 'Loading…',
    rps: {
      title: 'Rock, paper, scissors',
      fallbackMove: "Fallback move (when you don't play in time)",
    },
  },
  optionValues: {
    rock: 'Rock',
    paper: 'Paper',
    scissors: 'Scissors',
    random: 'Random',
  },
  errors: {
    load: 'Could not load game preferences',
    save: 'Could not save game preferences',
  },
}

export default preferences
