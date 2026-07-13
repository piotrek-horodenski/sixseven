import crypto from 'crypto'

import { Match, QueueEntry } from '../models'
import { MatchEngine } from './engine'
import {
  MatchmakerConfig,
  defaultMatchmakerConfig,
  proposePairs,
  requeueAfterExpiry,
} from './matchmaker'
import { BotProvider, noopBotProvider } from './bot-provider'
import { settings } from '../settings'
import logger from './../logger'

/**
 * Scheduler — JEDNA pętla skanująca przeterminowane mecze (A5). Zastępuje timery
 * `setTimeout` per mecz: deadline'y żyją w dokumentach (`matches.deadline` +
 * indeks `{phase, deadline}`), a pętla jednym zapytaniem bierze mecze do
 * przejścia. To samo załatwia rehydrację po restarcie i przyszłe wiele instancji.
 *
 * Każde przejście po stronie engine jest guardowane (faza+runda), więc podwójne
 * przetworzenie tego samego meczu jest idempotentne.
 *
 * Etap 4e: ta sama pętla (wzorzec deadline'ów — stan w dokumentach, zero timerów
 * w pamięci) napędza TICK MATCHMAKERA (kontrakt §2 „Pętla matchmakera"):
 * wygaszanie propozycji po deadline, watchdog `matched`, parowanie FIFO+okno ELO
 * (czystą funkcją proposePairs) oraz hak na bota (scaffold Etapu 5) dla lobby
 * z wolnym slotem. Tick kolejki jest dławiony do ~tickIntervalMs (2 s).
 */
export interface SchedulerExtensions {
  /** Nadpisania konfiguracji matchmakera (okna ELO, accept-timeout, TTL matched). */
  matchmaker?: Partial<MatchmakerConfig>
  /** Dostawca botów dla lobby z wolnym slotem (Etap 5). Domyślnie noop. */
  botProvider?: BotProvider
  /** Wyłącznik ticku kolejki/botów (testy skupione na deadline'ach). Default true. */
  queueEnabled?: boolean
  /** Generator proposalId (testy). */
  genProposalId?: () => string
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false
  private lastQueueTick = 0
  private readonly mmConfig: MatchmakerConfig
  private readonly botProvider: BotProvider
  private readonly queueEnabled: boolean
  private readonly genProposalId: () => string

  constructor(
    private readonly engine: MatchEngine,
    private readonly now: () => number = () => Date.now(),
    private readonly intervalMs: number = settings.schedulerIntervalMs,
    private readonly batchSize: number = 100,
    ext: SchedulerExtensions = {},
  ) {
    this.mmConfig = { ...defaultMatchmakerConfig, ...(ext.matchmaker ?? {}) }
    this.botProvider = ext.botProvider ?? noopBotProvider
    this.queueEnabled = ext.queueEnabled ?? true
    this.genProposalId = ext.genProposalId ?? (() => crypto.randomBytes(8).toString('hex'))
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error({ err }, 'scheduler tick failed'))
    }, this.intervalMs)
    logger.info({ intervalMs: this.intervalMs }, 'scheduler started')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Jeden przebieg: znajdź mecze w fazie czasowej z minionym deadline i wykonaj
   * właściwe przejście. `ticking` chroni przed nakładaniem się przebiegów, gdy
   * poprzedni jeszcze trwa (np. wolny /resolve).
   */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const now = this.now()
      const due = await Match.find({
        deadline: { $ne: null, $lte: now },
        phase: { $in: ['lobby', 'planning', 'resolving', 'revealing', 'paused'] },
      })
        .sort({ deadline: 1 })
        .limit(this.batchSize)

      for (const m of due) {
        const id = String(m._id)
        try {
          switch (m.phase) {
            case 'lobby': {
              // Etap 3B pkt 3: brak auto-cancel lobby. Deadline w lobby powstaje
              // dopiero po 1. `playerReady` (planningPhaseMs) — jeśli go minęliśmy,
              // to znaczy, że KTOŚ jest gotowy: auto-startujemy mecz mimo
              // niekompletnego rosteru (pozostali dostaną defaultMove w grze).
              const lobbyReady = (m.lobbyReady ?? {}) as Record<string, boolean>
              if (Object.values(lobbyReady).some((v) => v === true)) {
                await this.engine.start(id)
              }
              break
            }
            case 'planning':
              await this.engine.closePhase(id)
              break
            case 'resolving':
              await this.engine.resolveOnce(id)
              break
            case 'revealing':
              await this.engine.revealDone(id)
              break
            case 'paused':
              await this.engine.cancel(id, 'cancelled_paused')
              break
          }
        } catch (err) {
          logger.error({ err, matchId: id, phase: m.phase }, 'scheduler failed to advance match')
        }
      }

      // ─── Etap 4e: tick matchmakera + hak na bota (dławione do ~2 s) ───────
      if (this.queueEnabled && now - this.lastQueueTick >= this.mmConfig.tickIntervalMs) {
        this.lastQueueTick = now
        try {
          await this.queueTick(now)
        } catch (err) {
          logger.error({ err }, 'scheduler queue tick failed')
        }
        try {
          await this.botTick()
        } catch (err) {
          logger.error({ err }, 'scheduler bot tick failed')
        }
      }
    } finally {
      this.ticking = false
    }
  }

  /**
   * Tick kolejki szybkiego meczu (kontrakt §2 „Pętla matchmakera"):
   * 1) propozycje po deadline — akceptujący wraca do `waiting` BEZ zmiany
   *    `since`, nieakceptujący z `since = now` (koniec kolejki);
   * 2) watchdog `matched` — wpisy starsze niż matchedTtlMs → delete;
   * 3) parowanie per gra: `waiting` FIFO → proposePairs (czysta funkcja) →
   *    oba wpisy `proposed` ze wspólnym proposalId i deadline'em akceptu.
   * Wszystkie zapisy guardowane statusem (idempotentne przy wyścigu z accept/leave).
   */
  async queueTick(now: number): Promise<void> {
    // 1) Wygasłe propozycje.
    const expired = await QueueEntry.find({
      status: 'proposed',
      proposalDeadline: { $ne: null, $lte: now },
    }).limit(this.batchSize)
    for (const e of expired) {
      const requeued = requeueAfterExpiry({ accepted: !!e.accepted, since: e.since as number }, now)
      await QueueEntry.updateOne(
        // Guard na status+proposalId: równoległy accept, który zdążył przestawić
        // wpis na matched, wygrywa — nie cofamy go do kolejki.
        { _id: e._id, status: 'proposed', proposalId: e.proposalId },
        {
          $set: {
            status: requeued.status,
            since: requeued.since,
            accepted: false,
            proposalId: null,
            proposalDeadline: null,
            updatedAt: now,
          },
        },
      )
    }

    // 2) Watchdog matched: klient miał matchedTtlMs na handoff — sprzątamy.
    await QueueEntry.deleteMany({
      status: 'matched',
      updatedAt: { $lte: now - this.mmConfig.matchedTtlMs },
    })

    // 3) Parowanie FIFO + okno ELO per gra.
    const gameIds = (await QueueEntry.distinct('gameId', { status: 'waiting' })) as string[]
    for (const gameId of gameIds) {
      const waiting = await QueueEntry.find({ gameId, status: 'waiting' })
        .sort({ since: 1 })
        .limit(this.batchSize)
      const pairs = proposePairs(
        waiting.map((e) => ({ userId: String(e.userId), elo: Number(e.elo), since: Number(e.since) })),
        this.mmConfig,
        now,
      )
      for (const [a, b] of pairs) {
        const proposalId = this.genProposalId()
        const upd = await QueueEntry.updateMany(
          { gameId, userId: { $in: [a.userId, b.userId] }, status: 'waiting' },
          {
            $set: {
              status: 'proposed',
              proposalId,
              proposalDeadline: now + this.mmConfig.acceptTimeoutMs,
              accepted: false,
              updatedAt: now,
            },
          },
        )
        if (upd.modifiedCount !== 2) {
          // Wyścig (leave w międzyczasie): cofnij połowiczną propozycję do
          // waiting BEZ zmiany since — nikt nie traci miejsca w kolejce.
          await QueueEntry.updateMany(
            { proposalId },
            { $set: { status: 'waiting', proposalId: null, proposalDeadline: null, accepted: false, updatedAt: now } },
          )
        }
      }
    }
  }

  /**
   * Hak na bota (Etap 4e — SCAFFOLD, pełna implementacja w Etapie 5): dla
   * każdego meczu w lobby z wolnym slotem wołamy provider (domyślnie noop).
   */
  private async botTick(): Promise<void> {
    const lobbies = await Match.find({ phase: 'lobby' }).limit(this.batchSize)
    for (const m of lobbies) {
      const players = (m.players ?? []) as string[]
      const guestIds = (m.guestIds ?? []) as string[]
      const capacity = (m.capacity as number) ?? 2
      if (players.length + guestIds.length >= capacity) continue
      await this.botProvider.maybeJoinLobby({
        matchId: String(m._id),
        gameId: m.gameId as string,
        players,
        guestIds,
        capacity,
        createdAt: (m.createdAt as number) ?? 0,
      })
    }
  }
}
