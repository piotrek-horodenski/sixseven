import { describe, it, expect } from 'vitest'
import { sign } from 'sixseven-hmac'

import { handleResolve, handleInit, resolvePipeline } from '../src/serve'
import { ResolveRequest, ResolveResponse, InitRequest, InitResponse } from '../src/contract'
import { rps } from './fixtures/games'

const SECRET = 'serve-test-secret'
const NOW = 1_700_000_000_000

function req(over: Partial<ResolveRequest> = {}): ResolveRequest {
  const state = rps.init({ playerIds: ['p1', 'p2'], seed: 's', playerData: {}, options: {} })
  return {
    matchId: 'm1',
    round: 1,
    idempotencyKey: 'm1:1',
    manifestVersion: '1.0.0',
    state,
    moves: [
      { playerId: 'p1', move: 'rock' },
      { playerId: 'p2', move: 'scissors' },
    ],
    latePlayers: [],
    ...over,
  }
}

function signed(request: ResolveRequest) {
  const body = JSON.stringify(request)
  const { timestamp, signature } = sign(SECRET, body, NOW)
  return {
    body,
    headers: { 'x-sixseven-timestamp': timestamp, 'x-sixseven-signature': signature },
  }
}

describe('handleResolve', () => {
  it('poprawnie podpisane żądanie → 200 i odpowiedź w schemacie', () => {
    const { body, headers } = signed(req())
    const res = handleResolve(rps, body, headers, { secret: SECRET, now: NOW })
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body) as ResolveResponse
    expect(parsed.finished).toBe(false)
    expect(parsed.points).toEqual({ p1: 1 }) // rock bije scissors
    expect(parsed.views.map((v) => v.playerId).sort()).toEqual(['p1', 'p2'])
    expect(parsed.revealDurationMs).toBe(1000)
  })

  it('zły podpis → 401', () => {
    const { body } = signed(req())
    const res = handleResolve(rps, body, { 'x-sixseven-timestamp': String(NOW), 'x-sixseven-signature': 'deadbeef' }, { secret: SECRET, now: NOW })
    expect(res.status).toBe(401)
  })

  it('podpis spoza okna czasu → 401', () => {
    const { body, headers } = signed(req())
    // Weryfikacja „teraz" przesunięta o 60 s poza okno ±30 s.
    const res = handleResolve(rps, body, headers, { secret: SECRET, now: NOW + 60_000 })
    expect(res.status).toBe(401)
  })

  it('zbyt duże ciało → 413 (zanim sparsujemy/zweryfikujemy)', () => {
    const { body, headers } = signed(req())
    const res = handleResolve(rps, body, headers, { secret: SECRET, now: NOW, maxBodyBytes: 10 })
    expect(res.status).toBe(413)
  })

  it('nielegalny ruch → defaultMove (rock) oznaczony defaulted', () => {
    const r = req({ moves: [{ playerId: 'p1', move: 'banana' }, { playerId: 'p2', move: 'scissors' }] })
    const { body, headers } = signed(r)
    const res = handleResolve(rps, body, headers, { secret: SECRET, now: NOW })
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body) as ResolveResponse
    const picks = (parsed.events[0] as any).picks as any[]
    const p1 = picks.find((p) => p.playerId === 'p1')
    expect(p1.move).toBe('rock')       // podstawiony defaultMove
    expect(p1.defaulted).toBe(true)
  })

  it('spóźniony gracz → defaultMove oznaczony defaulted', () => {
    const r = req({ moves: [{ playerId: 'p1', move: 'paper' }], latePlayers: ['p2'] })
    const { body, headers } = signed(r)
    const res = handleResolve(rps, body, headers, { secret: SECRET, now: NOW })
    const parsed = JSON.parse(res.body) as ResolveResponse
    const picks = (parsed.events[0] as any).picks as any[]
    const p2 = picks.find((p) => p.playerId === 'p2')
    expect(p2.defaulted).toBe(true)
    expect(parsed.points).toEqual({ p1: 1 }) // paper bije rock
  })

  it('niepoprawny JSON → 400', () => {
    const { headers } = signed(req())
    // Podpiszmy śmieci, żeby przejść HMAC, ale nie sparsować.
    const garbage = '{ not json'
    const s = sign(SECRET, garbage, NOW)
    const res = handleResolve(rps, garbage, { 'x-sixseven-timestamp': s.timestamp, 'x-sixseven-signature': s.signature }, { secret: SECRET, now: NOW })
    expect(res.status).toBe(400)
  })
})

describe('handleInit', () => {
  function initReq(): InitRequest {
    return {
      matchId: 'm1',
      manifestVersion: '1.0.0',
      playerIds: ['p1', 'p2'],
      seed: 's',
      playerData: {},
      options: { target: 3 },
    }
  }

  it('poprawnie podpisane /init → 200 i stan początkowy z gry', () => {
    const body = JSON.stringify(initReq())
    const { timestamp, signature } = sign(SECRET, body, NOW)
    const res = handleInit(rps, body, { 'x-sixseven-timestamp': timestamp, 'x-sixseven-signature': signature }, { secret: SECRET, now: NOW })
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body) as InitResponse
    // Fixtura RPS (uproszczona) — stan początkowy to { round, scores }.
    const state = parsed.state as { round: number; scores: Record<string, number> }
    expect(state.round).toBe(1)
    expect(state.scores).toEqual({ p1: 0, p2: 0 })
  })

  it('zły podpis /init → 401', () => {
    const body = JSON.stringify(initReq())
    const res = handleInit(rps, body, { 'x-sixseven-timestamp': String(NOW), 'x-sixseven-signature': 'bad' }, { secret: SECRET, now: NOW })
    expect(res.status).toBe(401)
  })
})

describe('resolvePipeline (współdzielony rdzeń)', () => {
  it('serve i pipeline liczą identycznie', () => {
    const request = req()
    const direct = resolvePipeline(rps, request)
    const { body, headers } = signed(request)
    const viaServe = JSON.parse(handleResolve(rps, body, headers, { secret: SECRET, now: NOW }).body)
    expect(viaServe).toEqual(direct)
  })
})
