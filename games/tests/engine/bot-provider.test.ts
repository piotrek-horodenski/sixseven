import { describe, it, expect, vi } from 'vitest'

import {
  createBotProvider,
  isBotId,
  randomRpsMove,
  BOT_ID_PREFIX,
  type BotProviderDeps,
  type BotConfig,
  type LobbyMatchInfo,
  type PlanningMatchInfo,
} from '../../app/engine/bot-provider'

/**
 * bot-provider.ts — Etap 4f (kontrakt docs/ETAP4F_BOT_CONTRACT.md). Wszystkie
 * zależności wstrzykiwane, więc test jest czysto jednostkowy (bez DB/HTTP).
 */

const NOW = 1_000_000
const RPS_SET = new Set(['rock', 'paper', 'scissors'])

function makeDeps(over: Partial<BotProviderDeps> = {}): BotProviderDeps {
  let n = 0
  return {
    getRegistration: vi.fn().mockResolvedValue({
      version: '1.0.0',
      endpoint: { url: 'http://game.local', secret: 'secret' },
    }),
    init: vi.fn().mockResolvedValue({ ok: true, state: { round: 1 } }),
    loadPlayerMemory: vi.fn().mockResolvedValue({}),
    addPlayer: vi.fn().mockResolvedValue('added'),
    playerReady: vi.fn().mockResolvedValue(undefined),
    submitMove: vi.fn().mockResolvedValue('accepted'),
    hasSubmitted: vi.fn().mockResolvedValue(false),
    genSeed: vi.fn(() => 'seed'),
    now: vi.fn(() => NOW),
    genBotId: vi.fn(() => `${BOT_ID_PREFIX}${++n}`),
    ...over,
  }
}

function makeConfig(over: Partial<BotConfig> = {}): BotConfig {
  return {
    enabled: true,
    joinWaitMs: 15_000,
    nick: 'Bot',
    strategies: { rps: randomRpsMove },
    ...over,
  }
}

function lobby(over: Partial<LobbyMatchInfo> = {}): LobbyMatchInfo {
  return {
    matchId: 'm1',
    gameId: 'rps',
    players: ['u1'],
    guestIds: [],
    capacity: 2,
    createdAt: NOW - 20_000, // czekał 20 s > próg 15 s
    manifestVersion: '1.0.0',
    options: {},
    ...over,
  }
}

describe('bot-provider — helpery', () => {
  it('isBotId rozpoznaje prefiks bota, odrzuca usera/gościa', () => {
    expect(isBotId('bot_abc')).toBe(true)
    expect(isBotId('g_123')).toBe(false)
    expect(isBotId('64f0aa11bb22cc33dd44ee55')).toBe(false)
    expect(isBotId('')).toBe(false)
  })

  it('randomRpsMove zwraca legalny ruch i NIE zawsze ten sam (losowość)', () => {
    const seen = new Set<unknown>()
    for (let i = 0; i < 60; i++) {
      const m = randomRpsMove()
      expect(RPS_SET.has(m as string)).toBe(true)
      seen.add(m)
    }
    expect(seen.size).toBeGreaterThan(1) // statystycznie pewne dla 60 losowań z 3
  })
})

describe('bot-provider — maybeJoinLobby', () => {
  it('dosadza bota po progu: addPlayer(guest, nick) + playerReady', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby())

    expect(deps.addPlayer).toHaveBeenCalledTimes(1)
    const [matchId, botId, kind, state, nick] = (deps.addPlayer as any).mock.calls[0]
    expect(matchId).toBe('m1')
    expect(isBotId(botId)).toBe(true)
    expect(kind).toBe('guest')
    expect(state).toEqual({ round: 1 })
    expect(nick).toBe('Bot')
    expect(deps.playerReady).toHaveBeenCalledWith('m1', botId)
  })

  it('NIE dosadza przed upływem progu czekania', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby({ createdAt: NOW - 5_000 })) // 5 s < 15 s
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })

  it('NIE dosadza, gdy nie czeka żaden człowiek (sam bot / pusto)', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby({ players: [], guestIds: ['bot_x'] }))
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })

  it('NIE dosadza dla gry bez zaszytej strategii (MVP: tylko rps)', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby({ gameId: 'chess' }))
    expect(deps.getRegistration).not.toHaveBeenCalled()
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })

  it('wyłączony provider nic nie robi', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig({ enabled: false }))
    await provider.maybeJoinLobby(lobby())
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })

  it('wypełnia do capacity: 1 człowiek + capacity 3 → 2 boty', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby({ capacity: 3 }))
    expect(deps.addPlayer).toHaveBeenCalledTimes(2)
    expect(deps.playerReady).toHaveBeenCalledTimes(2)
    // Kolejne /init dostają rosnący roster (2, potem 3 graczy).
    const initRosters = (deps.init as any).mock.calls.map((c: any[]) => c[1].playerIds.length)
    expect(initRosters).toEqual([2, 3])
  })

  it('przerywa dokładanie, gdy addPlayer zwróci "full" (wyścig)', async () => {
    const deps = makeDeps({ addPlayer: vi.fn().mockResolvedValue('full') })
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby({ capacity: 4 }))
    expect(deps.addPlayer).toHaveBeenCalledTimes(1) // nie zapętla się
    expect(deps.playerReady).not.toHaveBeenCalled()
  })

  it('nie dosadza, gdy /init gry zawiedzie', async () => {
    const deps = makeDeps({ init: vi.fn().mockResolvedValue({ ok: false, state: null }) })
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby())
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })

  it('nie dosadza bez rejestracji gry', async () => {
    const deps = makeDeps({ getRegistration: vi.fn().mockResolvedValue(null) })
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybeJoinLobby(lobby())
    expect(deps.init).not.toHaveBeenCalled()
    expect(deps.addPlayer).not.toHaveBeenCalled()
  })
})

describe('bot-provider — maybePlay', () => {
  function planning(over: Partial<PlanningMatchInfo> = {}): PlanningMatchInfo {
    return { matchId: 'm1', gameId: 'rps', round: 2, botIds: ['bot_1'], ...over }
  }

  it('składa losowy legalny ruch dla bota, który nie złożył', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybePlay(planning())
    expect(deps.submitMove).toHaveBeenCalledTimes(1)
    const [matchId, botId, move] = (deps.submitMove as any).mock.calls[0]
    expect(matchId).toBe('m1')
    expect(botId).toBe('bot_1')
    expect(RPS_SET.has(move)).toBe(true)
  })

  it('NIE składa drugi raz w tej samej rundzie (guard hasSubmitted)', async () => {
    const deps = makeDeps({ hasSubmitted: vi.fn().mockResolvedValue(true) })
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybePlay(planning())
    expect(deps.submitMove).not.toHaveBeenCalled()
  })

  it('składa dla wielu botów naraz', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybePlay(planning({ botIds: ['bot_1', 'bot_2'] }))
    expect(deps.submitMove).toHaveBeenCalledTimes(2)
  })

  it('nie składa dla gry bez strategii', async () => {
    const deps = makeDeps()
    const provider = createBotProvider(deps, makeConfig())
    await provider.maybePlay(planning({ gameId: 'chess' }))
    expect(deps.hasSubmitted).not.toHaveBeenCalled()
    expect(deps.submitMove).not.toHaveBeenCalled()
  })
})
