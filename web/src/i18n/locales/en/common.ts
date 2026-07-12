import type pl from '../pl/common'

// Parytet kluczy z pl/common wymusza typ. WŁAŚCICIEL: Agent A.
const common: typeof pl = {
  save: 'Save',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  back: 'Back',
  yes: 'Yes',
  no: 'No',
  loading: 'Loading…',
  error: 'Error',
  saving: 'Saving…',
  saved: 'Saved',
  noResults: 'No results',
  selectAll: 'Select all',
  clear: 'Clear',
  pickColor: 'Pick color',
  presets: 'Presets',
  saveAsPreset: 'Save as preset',
  removePreset: 'Remove preset',
  noSavedPresets: 'No saved presets yet',
  switchFormat: 'Switch format (current: {format})',
}

export default common
