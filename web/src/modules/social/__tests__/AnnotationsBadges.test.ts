import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

import AnnotationsBadges from '../AnnotationsBadges.vue'
import type { Annotation } from '@/stores/social/community.model'

/**
 * Testy FIXU „etykiety odznak" (kontrakt §4 „Fixy" pkt 3, §5 WEB): etykieta
 * z mapy i18n `community.badges.<badgeId>`, fallback na surowe `badgeId` dla
 * odznak bez tłumaczenia (np. z manifestów gier zewnętrznych).
 * Locale pl (vitest.setup) — asercje po polsku.
 */

const stubs: Record<string, any> = {
  fa: defineComponent({ props: ['icon'], setup: (p) => () => h('i', { class: `fa-${p.icon}` }) }),
}

function badge(overrides: Partial<Annotation> = {}): Annotation {
  return {
    _id: 'a1',
    playerId: 'bob',
    gameId: 'rps',
    badgeId: 'flawless',
    sentiment: 'positive',
    earnedAt: 1_700_000_000_000,
    ...overrides,
  } as Annotation
}

function mountBadges(badges: Annotation[]) {
  return mount(AnnotationsBadges, { props: { badges }, global: { stubs } })
}

describe('AnnotationsBadges — etykiety odznak (fix z backlogu)', () => {
  it('znany badgeId → etykieta z community.badges.<badgeId>', () => {
    const wrapper = mountBadges([badge({ badgeId: 'flawless' })])
    expect(wrapper.text()).toContain('Bez skazy')
    expect(wrapper.text()).not.toContain('flawless')
  })

  it('badgeId z myślnikiem też idzie przez mapę i18n', () => {
    const wrapper = mountBadges([badge({ _id: 'a2', badgeId: 'mind-reader' })])
    expect(wrapper.text()).toContain('Czytający w myślach')
  })

  it('nieznany badgeId → fallback na surowe badgeId (bez pustej etykiety)', () => {
    const wrapper = mountBadges([
      badge({ _id: 'a3', badgeId: 'zewnetrzna-odznaka', sentiment: 'neutral' }),
    ])
    expect(wrapper.text()).toContain('zewnetrzna-odznaka')
  })

  it('pusta lista → komunikat o braku odznak', () => {
    const wrapper = mountBadges([])
    expect(wrapper.text()).toContain('Brak odznak.')
  })
})
