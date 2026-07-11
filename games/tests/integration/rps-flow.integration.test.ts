import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from 'http'
import { serve } from 'sixseven-sdk'
import { rps } from 'sixseven-game-rps'

import { Match, MatchState, MatchEvent, MatchView, ResolveLog, PlayerMemory } from '../../app/models'
import { MatchEngine } from '../../app/engine/engine'
import { Scheduler } from '../../app/engine/scheduler'
import { registerGame, createRegistrationResolver } from '../../app/services/register-game'
import { settings } from '../../app/settings'
import { startRealCommandApi, RealCommandApi } from '../helpers/real-command-router'

/**
 * E2E PEŁNEGO PRZEPŁYWU (Etap 3 pkt 5 + Etap 3B): `command-api` (HTTP, jak
 * woła gate) ↔ silnik (`MatchEngine`/`Scheduler`) ↔ PRAWDZIWY serwis RPS (SDK
 * `serve`) ↔ REALNE Mongo (replica set). Inaczej niż `rps-e2e.integration.test.ts`
 * (który woła silnik BEZPOŚREDNIO, `engine.start()`), ten plik idzie DOKŁADNIE
 * tą samą drogą co produkcja: `create-match` → `join-match` (re-init) →
 * `/start` (brama gotowości `playerReady`) → `submit-move` → `/resolve`.
 *
 * Zegar: engine ma WSTRZYKNIĘTY zegar (`clock.t`), ale RPS (SDK `serve`) weryfikuje
 * podpis HMAC względem REALNEGO `Date.now()` (okno ±30s, `sixseven-hmac`) — nie da
 * się go wstrzyknąć bez zmiany `packages/sdk` (zakazane kontraktem). Dlatego
 * `clock.t` w tych testach NIGDY nie odjeżdża od realnego czasu więcej niż o kilka
 * sekund w momencie, gdy leci realne /init lub /resolve (patrz komentarze przy
 * `clock.t +=`). Tam, gdzie trzeba domknąć fazę BEZ czekania na deadline
 * (planningPhaseMs=15000 z manifestu RPS — nie da się go skrócić, manifest
 * NADPISUJE `options.planningPhaseMs` w `create-match`), wołamy
 * `engine.closePhase`/`scheduler.tick` bezpośrednio zamiast przesuwać zegar o
 * 15s (dozwolone przez zadanie: „wymuś zamknięcie fazy — deadline/scheduler lub
 * bezpośrednio").
 *
 * Wymaga replica setu (jak reszta integracyjnych games) — patrz setup.ts /
 * ETAP2.md „Jak uruchomić testy". Odpala Piotr:
 *   npm run test:integration --workspace games
 */

const RPS_SECRET = 'rps-flow-secret'
const INTERNAL_SECRET = 'internal-flow-secret'

describe('E2E przepływ: command-api + prawdziwy RPS + realne Mongo', () => {
  let rpsServer: Server
  let engine: MatchEngine
  let scheduler: Scheduler
  let api: RealCommandApi
  let clock: { t: number }

  beforeEach(async () => {
    clock = { t: Date.now() }
    rpsServer = serve(rps, { secret: RPS_SECRET, port: 0 })
    await new Promise<void>((r) => rpsServer.once('listening', () => r()))
    const rpsPort = (rpsServer.address() as any).port
    await registerGame({
      gameId: 'rps',
      version: rps.manifest.version,
      serviceUrl: `http://127.0.0.1:${rpsPort}`,
      hmacSecret: RPS_SECRET,
      manifest: rps.manifest as unknown as Record<string, unknown>,
    })

    engine = new MatchEngine({ resolveEndpoint: createRegistrationResolver(), now: () => clock.t })
    scheduler = new Scheduler(engine, () => clock.t)
    api = await startRealCommandApi({ engine, secret: INTERNAL_SECRET, now: () => clock.t })
  })

  afterEach(async () => {
    await api.stop()
    await new Promise<void>((r) => rpsServer.close(() => r()))
  })

  function post(path: string, body: unknown) {
    return fetch(`${api.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sixseven-internal': INTERNAL_SECRET },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
  }

  it('create-match(1) → join-match(2, /init realny) → playerReady oboje → planning → submit-move oboje → resolve realnym RPS → best-of do końca', async () => {
    // 1) Mecz powstaje OD RAZU z jednym graczem (Etap 3B pkt 1): lobby, deadline null.
    const created = await post('/create-match', { gameId: 'rps', players: ['p1'], capacity: 2, options: { target: 2 } })
    expect(created.status).toBe(200)
    const matchId = (created.body as any).matchId as string

    let match = await Match.findById(matchId)
    expect(match?.phase).toBe('lobby')
    expect(match?.deadline).toBeNull()
    expect(match?.capacity).toBe(2)
    expect(match?.players).toEqual(['p1'])

    let state1 = await MatchState.findOne({ matchId, round: 1 })
    expect((state1?.state as any).scores).toEqual({ p1: 0 }) // roster w /init = tylko p1 na razie

    // 2) Dołączenie p2 (Etap 3B pkt 2): re-init z PEŁNYM rosterem przez prawdziwy RPS.
    const joined = await post('/join-match', { matchId, playerId: 'p2', kind: 'user' })
    expect(joined.status).toBe(200)
    expect(joined.body).toEqual({ ok: true, matchId, playerId: 'p2', full: true })

    match = await Match.findById(matchId)
    expect(match?.phase).toBe('lobby') // dołączenie NIE startuje meczu samo z siebie
    expect(match?.players).toEqual(['p1', 'p2'])

    state1 = await MatchState.findOne({ matchId, round: 1 })
    expect((state1?.state as any).scores).toEqual({ p1: 0, p2: 0 }) // re-init: roster kompletny
    expect((state1?.state as any).fallback).toEqual({ p1: 'random', p2: 'random' }) // brak prefs → default dewelopera
    expect(state1?.sealed).toBe(false)

    // 3) Brama gotowości (Etap 3 pkt 5): Planning startuje dopiero po OBU.
    const readyP1 = await post('/start', { matchId, playerId: 'p1' })
    expect(readyP1.status).toBe(200)
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('lobby') // tylko jeden gotowy — jeszcze czeka
    expect(match?.deadline).toBe(clock.t + rps.manifest.planningPhaseMs) // pierwsze ready uzbraja deadline

    const readyP2 = await post('/start', { matchId, playerId: 'p2' })
    expect(readyP2.status).toBe(200)
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('planning') // komplet gotowości → Planning
    expect(match?.round).toBe(1)

    // 4) Runda 1: submit-move oboje → seal → /resolve PRAWDZIWYM RPS (papier bije kamień).
    const submitP1 = await post('/submit-move', { matchId, playerId: 'p1', move: 'paper' })
    expect(submitP1.status).toBe(200)
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('planning') // p2 jeszcze nie złożył — brak auto-close

    const submitP2 = await post('/submit-move', { matchId, playerId: 'p2', move: 'rock' })
    expect(submitP2.status).toBe(200)

    match = await Match.findById(matchId)
    expect(match?.phase).toBe('revealing') // target=2, runda 1 nie kończy meczu
    expect(match?.pendingFinish).toBe(false)
    expect((match?.score as any).p1).toBe(1)

    const ev1 = await MatchEvent.findOne({ matchId, round: 1 })
    expect(ev1).not.toBeNull()
    expect((ev1!.events as any[])[0].winner).toBe('p1')

    // Reveal timeout (deterministyczny — sam DB, żaden network call w revealDone,
    // więc skok zegara nie zagraża oknu HMAC realnego RPS).
    clock.t += 1500 + settings.revealMarginMs + 50
    await scheduler.tick()
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('planning')
    expect(match?.round).toBe(2)

    // 5) Runda 2: p1 wygrywa drugi raz z rzędu → osiąga target=2 → Finished.
    await post('/submit-move', { matchId, playerId: 'p1', move: 'paper' })
    await post('/submit-move', { matchId, playerId: 'p2', move: 'rock' })

    match = await Match.findById(matchId)
    expect(match?.phase).toBe('revealing')
    expect(match?.pendingFinish).toBe(true)
    expect((match?.score as any).p1).toBe(2)

    clock.t += 1500 + settings.revealMarginMs + 50
    await scheduler.tick()
    match = await Match.findById(matchId)
    expect(match?.phase).toBe('finished')
    expect(match?.endReason).toBe('finished')
    expect((match?.score as any).p1).toBe(2)

    // Widoki per gracz zapisane atomowo (A2) w każdej rundzie.
    expect(await MatchView.countDocuments({ matchId, round: 1 })).toBe(2)
    expect(await MatchView.countDocuments({ matchId, round: 2 })).toBe(2)
  })

  describe('RPS fallback end-to-end (player_memory → create-match/join-match → /init → defaultMove)', () => {
    async function readyBoth(matchId: string) {
      await post('/start', { matchId, playerId: 'p1' })
      const res = await post('/start', { matchId, playerId: 'p2' })
      expect((await Match.findById(matchId))?.phase).toBe('planning')
      return res
    }

    it('gracz z prefs fallbackMove=paper, spóźniony w planning → fallback "paper" z defaulted:true (match_events/match_views/resolve_log)', async () => {
      // Zasiej player_memory PRZED create/join — dokładnie łańcuch z kontraktu.
      await PlayerMemory.create({ gameId: 'rps', playerId: 'p2', prefs: { fallbackMove: 'paper' } })

      const created = await post('/create-match', { gameId: 'rps', players: ['p1'], capacity: 2, options: { target: 1 } })
      const matchId = (created.body as any).matchId as string
      await post('/join-match', { matchId, playerId: 'p2', kind: 'user' })

      const state1 = await MatchState.findOne({ matchId, round: 1 })
      expect((state1?.state as any).fallback).toEqual({ p1: 'random', p2: 'paper' }) // /init podchwycił prefs

      await readyBoth(matchId)

      // Tylko p1 składa ruch — p2 nigdy nie zdąży.
      await post('/submit-move', { matchId, playerId: 'p1', move: 'rock' })
      let match = await Match.findById(matchId)
      expect(match?.phase).toBe('planning')

      // Wymuś zamknięcie fazy BEZPOŚREDNIO (bez czekania 15s na deadline — patrz
      // komentarz u góry pliku o oknie HMAC ±30s realnego RPS).
      await engine.closePhase(matchId)

      match = await Match.findById(matchId)
      // target=1: paper (fallback p2) bije rock (p1) → p2 wygrywa → mecz kończy się od razu.
      expect(match?.phase).toBe('revealing')
      expect(match?.pendingFinish).toBe(true)
      expect((match?.score as any).p2).toBe(1)

      const ev = await MatchEvent.findOne({ matchId, round: 1 })
      expect(ev).not.toBeNull()
      const picks = (ev!.events as any[])[0].picks as { playerId: string; move: string; defaulted: boolean }[]
      const p1pick = picks.find((p) => p.playerId === 'p1')
      const p2pick = picks.find((p) => p.playerId === 'p2')
      expect(p1pick).toEqual({ playerId: 'p1', move: 'rock', defaulted: false })
      expect(p2pick).toEqual({ playerId: 'p2', move: 'paper', defaulted: true })
      expect((ev!.events as any[])[0].winner).toBe('p2')

      const p2view = await MatchView.findOne({ matchId, playerId: 'p2', round: 1 })
      expect((p2view?.view as any).yourMove).toBe('paper')

      // resolve_log: żądanie NIE niosło ruchu p2 (był latePlayer), ale ODPOWIEDŹ
      // realnego RPS (zalogowana w A4) niesie już policzony fallback.
      const log = await ResolveLog.findOne({ matchId, round: 1 })
      expect(log?.outcome).toBe('ok')
      expect((log?.request as any).latePlayers).toEqual(['p2'])
      expect((log?.request as any).moves.map((m: any) => m.playerId)).toEqual(['p1'])
      const loggedPicks = (log?.response as any).events[0].picks as { playerId: string; move: string; defaulted: boolean }[]
      expect(loggedPicks.find((p) => p.playerId === 'p2')).toEqual({ playerId: 'p2', move: 'paper', defaulted: true })
    })

    it('kontrolny: gracz BEZ prefs → fallback "random" deterministyczny (zgodny z rps.defaultMove na zapieczętowanym stanie)', async () => {
      const created = await post('/create-match', { gameId: 'rps', players: ['p1'], capacity: 2, options: { target: 1 } })
      const matchId = (created.body as any).matchId as string
      await post('/join-match', { matchId, playerId: 'p2', kind: 'user' })

      const state1 = await MatchState.findOne({ matchId, round: 1 })
      expect((state1?.state as any).fallback.p2).toBe('random') // brak prefs → default dewelopera

      await readyBoth(matchId)
      await post('/submit-move', { matchId, playerId: 'p1', move: 'rock' })
      await engine.closePhase(matchId)

      const ev = await MatchEvent.findOne({ matchId, round: 1 })
      expect(ev).not.toBeNull()
      const picks = (ev!.events as any[])[0].picks as { playerId: string; move: string; defaulted: boolean }[]
      const p2pick = picks.find((p) => p.playerId === 'p2')
      expect(p2pick?.defaulted).toBe(true)

      // Deterministyczny: dokładnie to, co zwraca PRODUKCYJNE defaultMove na tym
      // samym (zapieczętowanym) stanie wejściowym rundy 1 — dowód, że łańcuch
      // player_memory→/init→defaultMove faktycznie steruje wynikiem (nie coś
      // hardkodowanego osobno w tym teście).
      const expectedMove = rps.defaultMove(state1!.state as any, 'p2')
      expect(p2pick?.move).toBe(expectedMove)

      // Powtórne wywołanie defaultMove na tym samym stanie daje ten sam wynik
      // (wymóg replay-audytu/harness — brak Math.random).
      expect(rps.defaultMove(state1!.state as any, 'p2')).toBe(expectedMove)
    })
  })

  describe('scheduler realny: auto-start lobby po planningPhaseMs mimo niekompletnej gotowości (Etap 3B pkt 3)', () => {
    it('tylko p1 gotowy → po planningPhaseMs scheduler auto-startuje mecz → runda rozstrzyga się prawdziwym RPS', async () => {
      const created = await post('/create-match', { gameId: 'rps', players: ['p1'], capacity: 2, options: { target: 1 } })
      const matchId = (created.body as any).matchId as string
      await post('/join-match', { matchId, playerId: 'p2', kind: 'user' })

      await post('/start', { matchId, playerId: 'p1' }) // p2 NIGDY nie klika "Start"

      let match = await Match.findById(matchId)
      expect(match?.phase).toBe('lobby')
      expect(match?.deadline).toBe(clock.t + rps.manifest.planningPhaseMs)

      // Jeden skok zegara (planningPhaseMs) — bezpieczny wobec okna HMAC ±30s,
      // bo dopiero PO nim leci jakikolwiek network call (submit-move poniżej).
      clock.t += rps.manifest.planningPhaseMs + 50
      await scheduler.tick()

      match = await Match.findById(matchId)
      expect(match?.phase).toBe('planning') // auto-start mimo braku ready od p2
      expect(match?.round).toBe(1)

      // Mimo że p2 nigdy nie kliknął "Start", może normalnie zagrać w planning.
      await post('/submit-move', { matchId, playerId: 'p1', move: 'paper' })
      await post('/submit-move', { matchId, playerId: 'p2', move: 'rock' })

      match = await Match.findById(matchId)
      expect(match?.phase).toBe('revealing') // target=1 → mecz kończy się tą rundą
      expect(match?.pendingFinish).toBe(true)
      expect((match?.score as any).p1).toBe(1)

      clock.t += 1500 + settings.revealMarginMs + 50
      await scheduler.tick()
      match = await Match.findById(matchId)
      expect(match?.phase).toBe('finished')
      expect(match?.endReason).toBe('finished')

      const ev = await MatchEvent.findOne({ matchId, round: 1 })
      expect((ev!.events as any[])[0].winner).toBe('p1')
    })
  })

  describe('get-prefs / set-prefs na realnym player_memory (Etap 3B pkt 5)', () => {
    it('round-trip: brak wpisu → {}, set-prefs zapisuje, get-prefs odczytuje to samo', async () => {
      const empty = await post('/get-prefs', { gameId: 'rps', playerId: 'p9' })
      expect(empty.status).toBe(200)
      expect(empty.body).toEqual({ prefs: {} })

      const setRes = await post('/set-prefs', { gameId: 'rps', playerId: 'p9', prefs: { fallbackMove: 'scissors' } })
      expect(setRes.status).toBe(200)

      const getRes = await post('/get-prefs', { gameId: 'rps', playerId: 'p9' })
      expect(getRes.body).toEqual({ prefs: { fallbackMove: 'scissors' } })

      const doc = await PlayerMemory.findOne({ gameId: 'rps', playerId: 'p9' })
      expect((doc?.prefs as any).fallbackMove).toBe('scissors')
    })
  })

  // ───────────────────────────────────────────────────────────────────────
  // REGRESJA (bug wykryty w audycie, NAPRAWIONY w tej sesji): brama gotowości
  // uwzględnia `capacity`. Twórca klikający „Rozpocznij" ZANIM ktokolwiek
  // dołączył NIE startuje meczu w pojedynkę — roster (1) < capacity (2), więc
  // `playerReady` zapisuje gotowość, ale zostawia mecz w `lobby` (twórca czeka
  // na przeciwnika bez limitu) i nie uzbraja deadline. Wcześniej roster=[creator]
  // był trywialnie „kompletny" → start w pojedynkę → miękki deadlock (join
  // odrzucał poza lobby, RPS nie kończył rundy).
  // ───────────────────────────────────────────────────────────────────────
  describe('capacity-gate: twórca w pojedynkę NIE startuje meczu (Etap 3B)', () => {
    it('twórca /start bez przeciwnika → mecz zostaje w lobby (deadline null); join dalej działa; dopiero komplet+gotowość → planning', async () => {
      const created = await post('/create-match', { gameId: 'rps', players: ['p1'], capacity: 2, options: { target: 1 } })
      const matchId = (created.body as any).matchId as string

      // Twórca klika „Rozpocznij" sam — brama gotowości nie startuje z wolnym slotem.
      await post('/start', { matchId, playerId: 'p1' })

      let match = await Match.findById(matchId)
      expect(match?.phase).toBe('lobby')
      expect((match?.lobbyReady as any).p1).toBe(true) // gotowość zapisana...
      expect(match?.deadline).toBeNull()               // ...ale bez uzbrojenia deadline (czeka bez limitu)

      // Przeciwnik wciąż może dołączyć (mecz nadal w lobby, slot wolny).
      const joined = await post('/join-match', { matchId, playerId: 'p2', kind: 'user' })
      expect(joined.status).toBe(200)
      match = await Match.findById(matchId)
      expect(match?.phase).toBe('lobby')

      // Twórca już gotowy; gdy p2 dopnie gotowość → komplet + pełny roster → Planning.
      await post('/start', { matchId, playerId: 'p2' })
      match = await Match.findById(matchId)
      expect(match?.phase).toBe('planning')
      expect(match?.round).toBe(1)
    })
  })
})
