import { describe, it, expect } from 'vitest'

import pl from '../locales/pl'
import en from '../locales/en'

/**
 * Parytet słowników i18n (kontrakt §4 i18n / §5 WEB). Pierwsza linia obrony to
 * TYP (`const ns: typeof pl = {...}` w każdym pliku en) — ten test domyka lukę
 * runtime'ową: typ nie wykryje np. ns pominiętego w en/index.ts ani rozjazdu
 * placeholderów `{param}` w tłumaczeniach.
 */

/** Rekurencyjnie zbiera ścieżki liści słownika (np. `games.exit.rankedTitle`). */
function leafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') {
      paths.push(...leafPaths(value as Record<string, unknown>, path))
    } else {
      paths.push(path)
    }
  }
  return paths.sort()
}

/**
 * Placeholdery vue-i18n w treści, np. `{game}`, `{seconds}` — UNIKALNE nazwy.
 * Porównujemy zbiory, nie liczbę wystąpień: pluralizacja pl ma 4 formy, en 2,
 * więc `{n}` legalnie występuje różną liczbę razy (np. images.confirmBatchDeleteMsg).
 * Wymóg semantyczny to „oba języki używają tych samych parametrów".
 */
function placeholders(text: unknown): string[] {
  if (typeof text !== 'string') return []
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
}

function leafAt(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as any)?.[key], obj)
}

describe('parytet i18n pl/en', () => {
  it('en ma DOKŁADNIE te same klucze co pl (wszystkie ns, w tym dev)', () => {
    expect(leafPaths(en as Record<string, unknown>)).toEqual(
      leafPaths(pl as Record<string, unknown>),
    )
  })

  it('nowe ns Etapu 4d/4e są wpięte w oba indeksy', () => {
    for (const dict of [pl, en] as Record<string, unknown>[]) {
      expect(dict.dev).toBeDefined()
      expect((dict as any).games.exit).toBeDefined()
      expect((dict as any).games.catalog).toBeDefined()
      expect((dict as any).home.quick).toBeDefined()
      expect((dict as any).community.badges).toBeDefined()
    }
  })

  it('placeholdery {param} zgadzają się między pl i en dla każdego klucza', () => {
    for (const path of leafPaths(pl as Record<string, unknown>)) {
      const plParams = placeholders(leafAt(pl as Record<string, unknown>, path))
      const enParams = placeholders(leafAt(en as Record<string, unknown>, path))
      expect(enParams, `rozjazd placeholderów w kluczu ${path}`).toEqual(plParams)
    }
  })
})
