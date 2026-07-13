import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Testy wejścia do gry przez useGameLaunch (kontrakt §4 „Katalog data-driven"):
 * builtin → `/game/rps?handoff=…`; zewnętrzna → redirect na
 * `uiUrl?handoff=CODE&return=<origin>` z JEDNORAZOWYM modalem ostrzegawczym
 * (potwierdzenie zapamiętane w localStorage per gameId).
 */

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    user: { _id: 'me', permissions: [] },
    call: mockCall,
    onReconnect: vi.fn(),
    offReconnect: vi.fn(),
  })),
}))

import { useGameLaunch, externalAckKey } from '../useGameLaunch'
import { useCatalogStore } from '@/stores/games/catalog.store'

/** Symuluje broadcast serwera na sockecie usera (subskrypcja games). */
function fireAll(event: string, ...args: any[]) {
  mockOn.mock.calls.filter((c: any) => c[0] === event).forEach((c: any) => c[1](...args))
}

const EXT_GAME = {
  _id: 'wojna-kart',
  name: 'Wojna kart',
  builtin: false,
  status: 'published',
  devAccountId: 'dev1',
  uiUrl: 'https://gry.example.com/wojna',
  rankedEligible: false,
  manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 4, planningPhaseMs: 5000 },
}

function setupCatalog() {
  const catalog = useCatalogStore()
  catalog.init()
  fireAll('collection-init', 'games', [
    {
      _id: 'rps',
      name: 'Papier, kamień, nożyce',
      builtin: true,
      status: 'published',
      devAccountId: null,
      uiUrl: null,
      rankedEligible: true,
      manifest: { version: '1.0.0', minPlayers: 2, maxPlayers: 8, planningPhaseMs: 10_000 },
    },
    EXT_GAME,
  ])
}

describe('useGameLaunch — wejście do gry (4d)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.removeItem(externalAckKey('wojna-kart'))
  })

  it('builtin: nawigacja na /game/rps z kodem handoffu (bez modala)', () => {
    setupCatalog()
    const navigate = vi.fn()
    const launcher = useGameLaunch(navigate)

    launcher.launch({ code: 'KOD123', gameId: 'rps' })

    expect(launcher.pendingExternal.value).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/game/rps?handoff=KOD123&return=/')
  })

  it('zewnętrzna, pierwsze wejście: modal zamiast redirectu; confirm → redirect + zapis ack', () => {
    setupCatalog()
    const navigate = vi.fn()
    const launcher = useGameLaunch(navigate)

    launcher.launch({ code: 'KOD123', gameId: 'wojna-kart' })

    // Modal ostrzegawczy zamiast natychmiastowego redirectu
    expect(navigate).not.toHaveBeenCalled()
    expect(launcher.pendingExternal.value?.game._id).toBe('wojna-kart')
    const url = launcher.pendingExternal.value!.url
    expect(url.startsWith('https://gry.example.com/wojna?handoff=KOD123&return=')).toBe(true)
    expect(url).toContain(encodeURIComponent(window.location.origin))

    launcher.confirmExternal()
    expect(navigate).toHaveBeenCalledWith(url)
    expect(localStorage.getItem(externalAckKey('wojna-kart'))).toBeTruthy()
    expect(launcher.pendingExternal.value).toBeNull()
  })

  it('zewnętrzna, kolejne wejście (ack w localStorage): redirect BEZ modala', () => {
    setupCatalog()
    localStorage.setItem(externalAckKey('wojna-kart'), String(Date.now()))
    const navigate = vi.fn()
    const launcher = useGameLaunch(navigate)

    launcher.launch({ code: 'KOD456', gameId: 'wojna-kart' })

    expect(launcher.pendingExternal.value).toBeNull()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(String(navigate.mock.calls[0][0])).toContain('handoff=KOD456')
  })

  it('anulowanie modala: brak redirectu i brak zapisu ack', () => {
    setupCatalog()
    const navigate = vi.fn()
    const launcher = useGameLaunch(navigate)

    launcher.launch({ code: 'KOD123', gameId: 'wojna-kart' })
    launcher.cancelExternal()

    expect(navigate).not.toHaveBeenCalled()
    expect(launcher.pendingExternal.value).toBeNull()
    expect(localStorage.getItem(externalAckKey('wojna-kart'))).toBeNull()
  })

  it('gra spoza katalogu (katalog nie dopłynął): bezpieczny default builtin', () => {
    // Katalog pusty — launch nie może zgadywać uiUrl.
    const navigate = vi.fn()
    const launcher = useGameLaunch(navigate)

    launcher.launch({ code: 'KOD789', gameId: 'nieznana' })

    expect(navigate).toHaveBeenCalledWith('/game/rps?handoff=KOD789&return=/')
  })
})
