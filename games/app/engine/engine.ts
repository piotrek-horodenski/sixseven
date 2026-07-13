import mongoose from 'mongoose'

import { Match, Move, MatchState, MatchView, MatchEvent, ResolveLog, Rating } from '../models'
import { transition, MatchFsm, EngineEvent } from './state-machine'
import { callResolve, GameServiceEndpoint, ResolveCallResult } from './resolve-client'
import {
  EloConfig,
  defaultEloConfig,
  settleMatchElo,
  defaultedWalkoverLoser,
  PlayerRating,
} from './elo'
import { ResolveRequest, PlayerMove } from '../contract/wire'
import { settings } from '../settings'
import logger from '../logger'

/**
 * MatchEngine — orkiestracja rundy meczu. Łączy CZYSTĄ maszynę stanów z
 * efektami ubocznymi: zapisem sealed (A1), transakcyjnym zapisem wyniku (A2),
 * logiem prób (A4) i ustawianiem deadline'ów (A5 — retry/backoff napędza
 * scheduler przez `matches.deadline`, nie blokujący sleep).
 *
 * Zależności są WSTRZYKIWANE: `resolveEndpoint` (skąd wziąć URL+sekret serwisu
 * gry — rejestracja to dopiero 2c) i `now`/`call` (testowalność bez zegara i
 * sieci). Dzięki temu engine jest odpięty od kolekcji `registrations`.
 */
export interface EngineDeps {
  resolveEndpoint: (gameId: string) => Promise<GameServiceEndpoint>
  now?: () => number
  /** Wstrzykiwalny klient /resolve (testy). Domyślnie realny callResolve. */
  call?: typeof callResolve
  /** Konfiguracja ELO/walkowerów (Etap 4e). Domyślnie defaultEloConfig. */
  eloConfig?: EloConfig
}

export interface CreateMatchInput {
  gameId: string
  manifestVersion: string
  players: string[]
  guestIds?: string[]
  /** Denormalizowane nazwy do wyświetlenia (id→nick). */
  nicks?: Record<string, string>
  /** Kod pokoju (denorm z gate) — do linku zaproszenia gościa. */
  roomCode?: string
  /** Docelowa liczba graczy (Etap 3B pkt 1). Default 2 (schema). */
  capacity?: number
  ranked?: boolean
  options?: Record<string, unknown>
  /** Stan początkowy gry (z /init; w testach podawany wprost). */
  initialState: unknown
  /** Opcjonalny z góry ustalony _id meczu (command API generuje go przed /init). */
  matchId?: string
}

/** Wynik `addPlayer` (Etap 3B pkt 2): dołączenie gracza do meczu w lobby. */
export type AddPlayerResult = 'added' | 'not-found' | 'not-lobby' | 'duplicate' | 'full'

function readFsm(match: any): MatchFsm {
  return {
    phase: match.phase,
    round: match.round,
    failCount: match.failCount ?? 0,
    pendingFinish: match.pendingFinish ?? false,
  }
}

export class MatchEngine {
  private readonly resolveEndpoint: EngineDeps['resolveEndpoint']
  private readonly now: () => number
  private readonly call: typeof callResolve
  private readonly eloConfig: EloConfig

  constructor(deps: EngineDeps) {
    this.resolveEndpoint = deps.resolveEndpoint
    this.now = deps.now ?? (() => Date.now())
    this.call = deps.call ?? callResolve
    this.eloConfig = deps.eloConfig ?? defaultEloConfig
  }

  private planningMs(match: any): number {
    const fromOpts = Number(match?.options?.planningPhaseMs)
    const ms = Number.isFinite(fromOpts) ? fromOpts : settings.planningMinMs
    return Math.max(ms, settings.planningMinMs)
  }

  /** Deadline-watchdog fazy resolving: po nim scheduler ponowi resolveOnce (rehydracja). */
  private resolveWatchdog(): number {
    return this.now() + settings.resolveBudgetMs + settings.revealMarginMs
  }

  // ─── Cykl życia ──────────────────────────────────────────────────────────

  /** Tworzy mecz w fazie `lobby` z zapisanym stanem początkowym rundy 1. */
  async createMatch(input: CreateMatchInput): Promise<string> {
    const now = this.now()
    // _id meczu jest STRINGIEM (schemat) bez domyślnego generatora — command-api
    // zwykle podaje `matchId` (genId), ale gdy silnik jest wołany bez niego
    // (testy, ścieżki wewnętrzne) musimy wygenerować _id sami, inaczej Mongoose
    // rzuci „document must have an _id before saving".
    const matchId = input.matchId ?? new mongoose.Types.ObjectId().toString()
    const match = await Match.create({
      _id: matchId,
      gameId: input.gameId,
      manifestVersion: input.manifestVersion,
      players: input.players,
      guestIds: input.guestIds ?? [],
      nicks: input.nicks ?? {},
      roomCode: input.roomCode ?? null,
      capacity: input.capacity ?? 2,
      ranked: input.ranked ?? false,
      options: input.options ?? {},
      phase: 'lobby',
      round: 0,
      // Etap 3B pkt 3: czekanie na przeciwnika BEZ limitu czasu (nie lobbyTimeoutMs).
      // Deadline lobby startuje dopiero przy pierwszym playerReady.
      deadline: null,
      ready: {},
      lobbyReady: {},
      score: {},
      createdAt: now,
      updatedAt: now,
    })
    // Stan wejściowy rundy 1 (sealed=false) — sadzimy już teraz, żeby rehydracja
    // i pierwszy /resolve miały z czego czytać.
    await MatchState.create({
      matchId: String(match._id),
      round: 1,
      sealed: false,
      state: input.initialState,
      manifestVersion: input.manifestVersion,
    })
    return String(match._id)
  }

  /** Lobby → Planning (komplet graczy gotowy). Wewnętrzny wyzwalacz, idempotentny. */
  async start(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match) return
    const res = transition(readFsm(match), { type: 'start' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return
    await this.openPlanning(matchId, res.next.round)
  }

  /**
   * Brama gotowości lobby (Etap 3 pkt 5 + 3B): gracz zgłasza, że jest gotowy zacząć.
   * Planning (i timer) startuje dopiero, gdy KAŻDY uczestnik rosteru
   * (`players ∪ guestIds`) zgłosił gotowość ORAZ roster jest PEŁNY (`capacity`) —
   * nie przy pierwszym kliknięciu i nigdy z wolnym slotem.
   * No-op poza fazą `lobby` i dla playerId spoza rosteru (idempotentne/bezpieczne).
   */
  async playerReady(matchId: string, playerId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'lobby') return
    const roster = [...match.players, ...match.guestIds]
    if (!roster.includes(playerId)) return

    // Auto-start ma sens dopiero, gdy roster jest PEŁNY (capacity). Inaczej twórca
    // sam w lobby „skompletowałby" gotowość na sobie i wystartował mecz w pojedynkę
    // (deadlock: `join-match` odrzuca poza lobby, a RPS nie domknie rundy). Póki
    // jest wolny slot: zapisz gotowość, ale NIE uzbrajaj deadline i NIE startuj.
    const capacity = (match.capacity as number) ?? 2
    const rosterFull = roster.length >= capacity

    // Etap 3B pkt 3: PIERWSZE zgłoszenie gotowości przy PEŁNYM rosterze uzbraja
    // deadline auto-startu (planningPhaseMs) — do tej pory lobby czeka bez limitu.
    const existingReady = (match.lobbyReady ?? {}) as Record<string, boolean>
    const isFirstReady = !Object.values(existingReady).some((v) => v === true)
    const setFields: Record<string, unknown> = { [`lobbyReady.${playerId}`]: true, updatedAt: this.now() }
    if (isFirstReady && rosterFull) {
      setFields.deadline = this.now() + this.planningMs(match)
    }

    await Match.updateOne(
      { _id: matchId, phase: 'lobby' },
      { $set: setFields },
    )

    // Policz gotowych z rosteru (odczyt świeżego stanu — inny gracz mógł dopisać
    // się równolegle). Wyścig dwóch „ready" naraz jest bezpieczny: `start()` jest
    // idempotentny (guard maszyny stanów na fazę `lobby`).
    const fresh = await Match.findById(matchId)
    if (!fresh || fresh.phase !== 'lobby') return
    const freshRoster = [...fresh.players, ...fresh.guestIds]
    const freshCapacity = (fresh.capacity as number) ?? 2
    const lobbyReady = (fresh.lobbyReady ?? {}) as Record<string, boolean>
    const allReady = freshRoster.every((pid) => lobbyReady[pid] === true)
    // Start dopiero, gdy WSZYSCY z rosteru gotowi ORAZ roster pełny — nigdy z wolnym slotem.
    if (allReady && freshRoster.length >= freshCapacity) {
      await this.start(matchId)
    }
  }

  /**
   * Dołączenie gracza do meczu w lobby (Etap 3B pkt 2). Guardy: mecz istnieje,
   * faza `lobby`, gracz jeszcze nie w składzie, jest wolny slot (capacity).
   * Dopisuje do `players` (user) lub `guestIds` (guest) i nadpisuje stan wejściowy
   * rundy 1 (`match_states`, sealed:false) świeżym `initialState` (re-init) — mecz
   * w lobby nie ma jeszcze żadnych ruchów, więc nadpisanie jest bezpieczne.
   * `initialState` jest dostarczany przez wywołującego (command-api woła /init z
   * pełnym rosterem, tak jak przy `createMatch`) — engine samo nie zna gry.
   */
  async addPlayer(matchId: string, playerId: string, kind: 'user' | 'guest', initialState: unknown, nick?: string): Promise<AddPlayerResult> {
    const match = await Match.findById(matchId)
    if (!match) return 'not-found'
    if (match.phase !== 'lobby') return 'not-lobby'
    if (match.players.includes(playerId) || match.guestIds.includes(playerId)) return 'duplicate'
    const capacity = (match.capacity as number) ?? 2
    const size = match.players.length + match.guestIds.length
    if (size >= capacity) return 'full'

    const field = kind === 'guest' ? 'guestIds' : 'players'
    const set: Record<string, unknown> = { updatedAt: this.now() }
    if (nick) set[`nicks.${playerId}`] = nick
    const upd = await Match.updateOne(
      { _id: matchId, phase: 'lobby' },
      { $addToSet: { [field]: playerId }, $set: set },
    )
    if (upd.modifiedCount === 0) return 'not-lobby' // wyścig: faza zmieniła się w międzyczasie

    await MatchState.updateOne(
      { matchId, round: 1 },
      { $set: { sealed: false, state: initialState, updatedAt: this.now() } },
    )
    return 'added'
  }

  /**
   * Złożenie/nadpisanie ruchu. Pisze WYŁĄCZNIE do prywatnej `moves` (I1, A3);
   * do `matches` trafia tylko fakt `ready[playerId]=true` (bez treści, I3).
   * Gdy wszyscy gotowi — zamyka fazę od razu (nie czeka na deadline).
   */
  async submitMove(matchId: string, playerId: string, move: unknown): Promise<'accepted' | 'rejected'> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'planning') return 'rejected'
    if (!match.players.includes(playerId) && !match.guestIds.includes(playerId)) return 'rejected'

    await Move.updateOne(
      { matchId, round: match.round, playerId },
      { $set: { move, ready: true, submittedAt: this.now() } },
      { upsert: true },
    )
    // Fakt gotowości w kolekcji subskrybowalnej — ustawiany raz, bez treści.
    await Match.updateOne(
      { _id: matchId, phase: 'planning', round: match.round },
      { $set: { [`ready.${playerId}`]: true, updatedAt: this.now() } },
    )

    // Komplet ruchów? Zamknij fazę.
    const roster = [...match.players, ...match.guestIds]
    const moves = await Move.countDocuments({ matchId, round: match.round, ready: true })
    if (moves >= roster.length) {
      await this.closePhase(matchId)
    }
    return 'accepted'
  }

  /**
   * Czy gracz złożył już ruch w danej rundzie (Etap 4f — guard bota: dokładnie
   * jedno złożenie na rundę). Czyta prywatną `moves`, nie wystawia treści.
   */
  async hasMove(matchId: string, round: number, playerId: string): Promise<boolean> {
    return (await Move.exists({ matchId, round, playerId, ready: true })) != null
  }

  private async openPlanning(matchId: string, round: number): Promise<void> {
    const now = this.now()
    const match = await Match.findById(matchId)
    if (!match) return
    // Wyczyść ruchy poprzedniej rundy tej samej rundy? Nie — moves są per runda.
    await Match.updateOne(
      { _id: matchId },
      {
        $set: {
          phase: 'planning',
          round,
          failCount: 0,
          attemptSeq: 0,
          pendingFinish: false,
          ready: {},
          deadline: now + this.planningMs(match),
          updatedAt: now,
        },
      },
    )
  }

  // ─── Zamknięcie fazy i zapieczętowanie (A1) ──────────────────────────────

  /**
   * Planning → Resolving. Najpierw ATOMOWO pieczętuje rundę (`sealed=true`)
   * w match_states, PRZED jakimkolwiek wywołaniem /resolve. Guard idempotencji:
   * zamyka tylko jeśli nadal `planning` i ta sama runda (A5).
   */
  async closePhase(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match) return
    const res = transition(readFsm(match), { type: 'close_phase' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return

    // 1) Trwałe zapieczętowanie PRZED resolve (A1). Idempotentne (upsert/set).
    await MatchState.updateOne(
      { matchId, round: match.round },
      { $set: { sealed: true, updatedAt: this.now() } },
    )
    // 2) Guardowane przejście fazy — tylko jeśli nadal planning tej rundy.
    //    deadline = watchdog (budżet + margines): jeśli proces padnie w trakcie
    //    resolve, scheduler po jego minięciu ponowi resolveOnce (rehydracja).
    //    Sukces/retry/pauza i tak nadpiszą deadline zanim watchdog wygaśnie.
    const upd = await Match.updateOne(
      { _id: matchId, phase: 'planning', round: match.round },
      { $set: { phase: 'resolving', failCount: 0, pendingFinish: false, deadline: this.resolveWatchdog(), updatedAt: this.now() } },
    )
    if (upd.modifiedCount === 0) return // ktoś już zamknął (double trigger)

    // Etap 4e (kontrakt „Walkower z rozłączenia"): przy seal policz defaulty.
    // Wykonywane DOKŁADNIE raz na rundę — tylko zwycięzca guardowanego przejścia
    // wyżej tu dociera. Złożony ruch → reset licznika do 0; brak ruchu → +1.
    // Sam walkower (próg defaultedStreakLimit) zapada dopiero PO zastosowaniu
    // wyniku rundy (applyResult) — gracz „dostaje" jeszcze wynik tej rundy.
    const roster = [...match.players, ...match.guestIds]
    const readyMoves = await Move.find({ matchId, round: match.round, ready: true })
    const submitted = new Set(readyMoves.map((m: any) => String(m.playerId)))
    const streakSet: Record<string, unknown> = {}
    const streakInc: Record<string, number> = {}
    for (const pid of roster) {
      if (submitted.has(pid)) streakSet[`defaultedStreak.${pid}`] = 0
      else streakInc[`defaultedStreak.${pid}`] = 1
    }
    const streakUpdate: Record<string, unknown> = {}
    if (Object.keys(streakSet).length > 0) streakUpdate.$set = streakSet
    if (Object.keys(streakInc).length > 0) streakUpdate.$inc = streakInc
    if (Object.keys(streakUpdate).length > 0) {
      await Match.updateOne({ _id: matchId }, streakUpdate)
    }

    await this.resolveOnce(matchId)
  }

  // ─── Resolve: jedna próba + decyzja retry/pause (A4) ─────────────────────

  /**
   * Jedna próba /resolve dla meczu w fazie `resolving`. Bezpieczna do wołania
   * wielokrotnie (scheduler retry + rehydracja): guard na fazę, zapewnienie
   * sealed, log próby, transakcyjny zapis wyniku.
   */
  async resolveOnce(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'resolving') return

    // Rehydracja/bezpieczeństwo: runda MUSI być zapieczętowana zanim ruchy
    // opuszczą platformę (A1). Jeśli nie jest — zapieczętuj (idempotentnie).
    await MatchState.updateOne(
      { matchId, round: match.round },
      { $set: { sealed: true } },
    )

    const stateDoc = await MatchState.findOne({ matchId, round: match.round })
    const endpoint = await this.resolveEndpoint(match.gameId)

    // Atomowo zwiększ licznik prób rundy (unikalny `attempt` do resolve_log, A4).
    // Guard na fazę+rundę: jeśli mecz już wyszedł z resolving, nie próbujemy.
    const claimed = await Match.findOneAndUpdate(
      { _id: matchId, phase: 'resolving', round: match.round },
      { $inc: { attemptSeq: 1 }, $set: { updatedAt: this.now() } },
      { returnDocument: 'after' },
    )
    if (!claimed) return
    const attempt = claimed.attemptSeq

    const roster = [...match.players, ...match.guestIds]
    const moveDocs = await Move.find({ matchId, round: match.round })
    const moves: PlayerMove[] = moveDocs
      .filter((m: any) => m.ready)
      .map((m: any) => ({ playerId: m.playerId, move: m.move }))
    const submitted = new Set(moves.map((m) => m.playerId))
    const latePlayers = roster.filter((p) => !submitted.has(p))

    const request: ResolveRequest = {
      matchId,
      round: match.round,
      idempotencyKey: `${matchId}:${match.round}`,
      manifestVersion: match.manifestVersion,
      state: stateDoc?.state ?? null,
      moves,
      latePlayers,
    }

    // Telemetria (G2): zegar ścienny (niezależny od logicznego this.now()),
    // wynik, rozmiar stanu i liczności — dane do kalibracji budżetów (Etap 5).
    const startedAt = Date.now()
    const result = await this.call(endpoint, request, { now: this.now() })
    const durationMs = Date.now() - startedAt
    logger.info(
      {
        evt: 'resolve',
        matchId,
        round: match.round,
        attempt,
        outcome: result.outcome,
        durationMs,
        stateBytes: Buffer.byteLength(JSON.stringify(stateDoc?.state ?? null), 'utf8'),
        moves: moves.length,
        late: latePlayers.length,
      },
      'resolve attempt',
    )
    await this.logAttempt(matchId, match.round, attempt, result)

    if (result.outcome === 'ok' && result.response) {
      await this.applyResult(matchId, result.response)
      // Oznacz użytą próbę w logu.
      await ResolveLog.updateOne(
        { matchId, round: match.round, attempt },
        { $set: { used: true } },
      )
      return
    }

    // Porażka próby → maszyna stanów decyduje: retry czy Paused.
    const res = transition(readFsm(match), { type: 'resolve_fail' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return

    if (res.effect === 'pause') {
      await Match.updateOne(
        { _id: matchId, phase: 'resolving', round: match.round },
        { $set: { phase: 'paused', failCount: res.next.failCount, deadline: this.now() + settings.pausedTimeoutMs, updatedAt: this.now() } },
      )
      logger.warn({ matchId, round: match.round }, 'match paused after resolve failures')
    } else {
      // retry_resolve — zaplanuj kolejną próbę przez scheduler (backoff), nie blokuj.
      const idx = Math.min(res.next.failCount - 1, settings.resolveBackoffMs.length - 1)
      const backoff = settings.resolveBackoffMs[idx] ?? 2000
      await Match.updateOne(
        { _id: matchId, phase: 'resolving', round: match.round },
        { $set: { failCount: res.next.failCount, deadline: this.now() + backoff, updatedAt: this.now() } },
      )
    }
  }

  private async logAttempt(matchId: string, round: number, attempt: number, result: ResolveCallResult): Promise<void> {
    const retentionMs = settings.resolveLogRetentionDays * 24 * 60 * 60 * 1000
    await ResolveLog.updateOne(
      { matchId, round, attempt },
      {
        $set: {
          request: result.requestBody,
          response: result.response,
          manifestVersion: result.requestBody.manifestVersion,
          outcome: result.outcome,
          used: false,
          expiresAt: new Date(this.now() + retentionMs),
        },
      },
      { upsert: true },
    )
  }

  // ─── Atomowy zapis wyniku rundy (A2) ─────────────────────────────────────

  /**
   * Zapis wyniku rundy w JEDNEJ transakcji multi-dokumentowej: match_events
   * (historia), match_views ×N (widoki per gracz), match_states rundy N+1 (stan
   * na kolejną rundę), oraz matches (faza/runda/score). Change streamy emitują
   * dopiero po commicie — klient nigdy nie widzi częściowego stanu.
   *
   * Wymaga replica setu. Idempotentne: upserty po kluczach (matchId,round[,player]).
   */
  async applyResult(matchId: string, response: {
    state: unknown
    events: unknown[]
    points: Record<string, number>
    views: { playerId: string; view: unknown }[]
    finished: boolean
    revealDurationMs: number
  }): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'resolving') return

    const res = transition(
      readFsm(match),
      { type: 'resolve_ok', finished: response.finished, revealDurationMs: response.revealDurationMs },
      { retryMax: settings.resolveRetryMax },
    )
    if (!res.changed) return

    const round = match.round
    const nextRound = round + 1
    const now = this.now()

    // Nowy wynik łączny (delta per runda).
    const score: Record<string, number> = { ...(match.score ?? {}) }
    for (const [pid, pts] of Object.entries(response.points ?? {})) {
      score[pid] = (score[pid] ?? 0) + Number(pts)
    }

    // Docelowy stan `matches` zależny od efektu.
    let matchSet: Record<string, unknown>
    if (res.effect === 'apply_result_reveal') {
      matchSet = {
        phase: 'revealing',
        pendingFinish: res.next.pendingFinish,
        failCount: 0,
        score,
        deadline: now + response.revealDurationMs + settings.revealMarginMs,
        updatedAt: now,
      }
    } else if (res.effect === 'apply_result_finish') {
      matchSet = { phase: 'finished', failCount: 0, score, deadline: null, endReason: 'finished', updatedAt: now }
    } else {
      // apply_result_advance — kolejna runda bez revealu.
      matchSet = {
        phase: 'planning',
        round: nextRound,
        failCount: 0,
        attemptSeq: 0,
        pendingFinish: false,
        ready: {},
        score,
        deadline: now + this.planningMs(match),
        updatedAt: now,
      }
    }

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        await MatchEvent.updateOne(
          { matchId, round },
          { $set: { events: response.events, points: response.points ?? {}, revealDurationMs: response.revealDurationMs, cancelled: false } },
          { upsert: true, session },
        )
        for (const v of response.views) {
          await MatchView.updateOne(
            { matchId, playerId: v.playerId, round },
            { $set: { view: v.view, updatedAt: now } },
            { upsert: true, session },
          )
        }
        if (!response.finished) {
          // Stan wejściowy kolejnej rundy (sealed=false), z wyniku tej rundy.
          await MatchState.updateOne(
            { matchId, round: nextRound },
            { $set: { sealed: false, state: response.state, manifestVersion: match.manifestVersion } },
            { upsert: true, session },
          )
        }
        // Guardowane przejście `matches` — commit marker; tylko jeśli nadal resolving tej rundy.
        await Match.updateOne(
          { _id: matchId, phase: 'resolving', round },
          { $set: matchSet },
          { session },
        )
      })
    } finally {
      await session.endSession()
    }

    // ─── Etap 4e: PO commicie wyniku rundy ───────────────────────────────────
    // Finisz bez revealu → nalicz ELO (idempotentne — garda eloApplied).
    // Runda nie kończy meczu → sprawdź walkower z rozłączenia (defaultedStreak).
    if (res.effect === 'apply_result_finish') {
      await this.applyEloIfDue(matchId)
    } else {
      await this.walkoverFromDefaults(matchId)
    }
  }

  // ─── Reveal ──────────────────────────────────────────────────────────────

  /** Revealing → Planning(next) | Finished (komplet reveal-done LUB timeout). */
  async revealDone(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'revealing') return
    const res = transition(readFsm(match), { type: 'reveal_done' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return

    if (res.effect === 'apply_result_finish') {
      await Match.updateOne(
        { _id: matchId, phase: 'revealing', round: match.round },
        { $set: { phase: 'finished', pendingFinish: false, deadline: null, endReason: 'finished', updatedAt: this.now() } },
      )
      // Etap 4e: finisz po revealu — nalicz ELO (idempotentne, garda eloApplied).
      await this.applyEloIfDue(matchId)
    } else {
      await this.openPlanning(matchId, res.next.round)
    }
  }

  // ─── Pauza / anulowanie ──────────────────────────────────────────────────

  /** Paused → Resolving (health-check OK) — ponowny /resolve zapieczętowanymi ruchami. */
  async resume(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || match.phase !== 'paused') return
    const res = transition(readFsm(match), { type: 'resume' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return
    const upd = await Match.updateOne(
      { _id: matchId, phase: 'paused', round: match.round },
      { $set: { phase: 'resolving', failCount: 0, deadline: this.resolveWatchdog(), updatedAt: this.now() } },
    )
    if (upd.modifiedCount === 0) return
    await this.resolveOnce(matchId)
  }

  /** Anulowanie meczu (lobby_timeout, pause_timeout, ręczne). Historia zostaje. */
  async cancel(matchId: string, reason: 'cancelled_lobby' | 'cancelled_paused' | 'cancelled'): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match) return
    const res = transition(readFsm(match), { type: 'cancel' }, { retryMax: settings.resolveRetryMax })
    if (!res.changed) return
    await Match.updateOne(
      { _id: matchId },
      { $set: { phase: 'cancelled', deadline: null, endReason: reason, updatedAt: this.now() } },
    )
    // Oznacz dotychczasową historię jako anulowaną (ELO/adnotacje jej nie liczą).
    await MatchEvent.updateMany({ matchId }, { $set: { cancelled: true } })
  }

  // ─── Ranked: walkower + ELO (Etap 4e, kontrakt §2) ───────────────────────

  /**
   * Zakończenie meczu RANKED walkowerem (abandon gracza lub 2 kolejne defaulty).
   * Guardowane przejście (jak cancel): wygrywa dokładnie JEDEN zapis — mecz w
   * `resolving` może mieć /resolve w locie, ale `applyResult` jest guardowany
   * na fazę `resolving` (A2/A5), więc po tym zapisie jego wynik zostaje
   * odrzucony bez naruszenia inwariantów. Casual → 'noop' (wyjście z casual
   * nie kończy meczu — defaultMove gra dalej).
   */
  async finishWalkover(
    matchId: string,
    loserId: string,
    reason: 'abandoned' | 'disconnected',
  ): Promise<'finished' | 'noop' | 'not-found' | 'not-member'> {
    const match = await Match.findById(matchId)
    if (!match) return 'not-found'
    const roster = [...match.players, ...match.guestIds]
    if (!roster.includes(loserId)) return 'not-member'
    if (!match.ranked) return 'noop'
    if (!['planning', 'resolving', 'revealing'].includes(match.phase)) return 'noop'
    const players = match.players as string[]
    // Ranked = dokładnie 2 zalogowanych (ścieżka kolejki); inne składy nie
    // podlegają walkowerowi (i tak nie dostałyby ELO — patrz settleMatchElo).
    if (players.length !== 2 || (match.guestIds as string[]).length > 0) return 'noop'
    const winnerId = players.find((p) => p !== loserId)!

    const upd = await Match.updateOne(
      { _id: matchId, phase: { $in: ['planning', 'resolving', 'revealing'] } },
      {
        $set: {
          phase: 'finished',
          deadline: null,
          pendingFinish: false,
          endReason: 'walkover',
          walkover: { loserId, winnerId, reason },
          updatedAt: this.now(),
        },
      },
    )
    if (upd.modifiedCount === 0) return 'noop' // wyścig — mecz zdążył się zakończyć
    logger.info({ matchId, loserId, winnerId, reason }, 'match finished by walkover')
    await this.applyEloIfDue(matchId)
    return 'finished'
  }

  /**
   * Walkower z rozłączenia (kontrakt): po zastosowaniu wyniku rundy w meczu
   * RANKED gracz z `defaultedStreak >= limit` przegrywa walkowerem
   * ('disconnected'). Obaj naraz → mecz cancelled bez ELO (patologiczny).
   * Pomijane, gdy mecz i tak kończy się naturalnie (pendingFinish po revealu).
   */
  private async walkoverFromDefaults(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match || !match.ranked) return
    if (!['planning', 'revealing'].includes(match.phase)) return
    if (match.pendingFinish) return // wynik naturalny zapadnie przy reveal_done
    const verdict = defaultedWalkoverLoser(
      (match.defaultedStreak ?? {}) as Record<string, number>,
      match.players as string[],
      this.eloConfig,
    )
    if (!verdict) return
    if ('cancelBoth' in verdict) {
      await this.cancel(matchId, 'cancelled')
      return
    }
    await this.finishWalkover(matchId, verdict.loserId, 'disconnected')
  }

  /**
   * Naliczenie ELO po finiszu (kontrakt §2 „Aplikacja"). Decyzja jest CZYSTA
   * (settleMatchElo: ranked && !eloApplied && bez gości && finished, walkower
   * pełne/pół K); tu wyłącznie efekty. Idempotencja: atomowy claim
   * `eloApplied:false→true` w TEJ SAMEJ transakcji co upserty `ratings` —
   * podwójny trigger (scheduler/reveal/abandon naraz) nic nie naliczy drugi raz.
   */
  async applyEloIfDue(matchId: string): Promise<void> {
    const match = await Match.findById(matchId)
    if (!match) return

    const players = (match.players ?? []) as string[]
    const ratingsIn: Record<string, PlayerRating> = {}
    for (const pid of players) {
      const doc = await Rating.findById(`${match.gameId}_${pid}`)
      ratingsIn[pid] = doc
        ? { elo: Number(doc.elo), matches: Number(doc.matches ?? 0) }
        : { elo: this.eloConfig.startElo, matches: 0 }
    }

    const updates = settleMatchElo(
      {
        phase: match.phase as string,
        endReason: match.endReason as string | null,
        ranked: !!match.ranked,
        eloApplied: !!match.eloApplied,
        players,
        guestIds: (match.guestIds ?? []) as string[],
        score: (match.score ?? {}) as Record<string, number>,
        walkover: (match.walkover ?? null) as { loserId: string; winnerId: string } | null,
      },
      ratingsIn,
      this.eloConfig,
    )
    if (!updates) return

    const now = this.now()
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const claim = await Match.updateOne(
          { _id: matchId, phase: 'finished', ranked: true, eloApplied: { $ne: true } },
          { $set: { eloApplied: true, updatedAt: now } },
          { session },
        )
        if (claim.modifiedCount === 0) return // ktoś już naliczył (idempotencja)
        for (const u of updates) {
          await Rating.updateOne(
            { _id: `${match.gameId}_${u.userId}` },
            {
              $set: {
                gameId: match.gameId,
                userId: u.userId,
                elo: u.elo,
                matches: u.matches,
                k: u.k,
                updatedAt: now,
              },
            },
            { upsert: true, session },
          )
        }
      })
    } finally {
      await session.endSession()
    }
  }
}
