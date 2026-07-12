import { config } from '@vue/test-utils'

import { i18n } from '@/i18n'

/**
 * Globalny setup testów (fala 3, i18n): każdy `mount()` dostaje plugin i18n —
 * template'y z `$t(...)` działają bez zmian w testach. Locale = 'pl'
 * (DEFAULT_LANGUAGE), więc asercje na widoczne teksty piszemy po polsku.
 */
config.global.plugins = [...(config.global.plugins ?? []), i18n]
