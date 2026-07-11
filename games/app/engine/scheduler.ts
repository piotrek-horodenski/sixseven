import { Match } from '../models'
import { MatchEngine } from './engine'
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
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false

  constructor(
    private readonly engine: MatchEngine,
    private readonly now: () => number = () => Date.now(),
    private readonly intervalMs: number = settings.schedulerIntervalMs,
    private readonly batchSize: number = 100,
  ) {}

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
    } finally {
      this.ticking = false
    }
  }
}
