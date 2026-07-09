import { describe, it, expect } from 'vitest'
import { transition, MatchFsm, TransitionConfig } from '../../app/engine/state-machine'

const cfg: TransitionConfig = { retryMax: 3 }

function fsm(overrides: Partial<MatchFsm> = {}): MatchFsm {
  return { phase: 'lobby', round: 0, failCount: 0, pendingFinish: false, ...overrides }
}

describe('state machine — transition()', () => {
  describe('lobby', () => {
    it('start → planning (round 1), effect open_planning', () => {
      const r = transition(fsm(), { type: 'start' }, cfg)
      expect(r.changed).toBe(true)
      expect(r.next.phase).toBe('planning')
      expect(r.next.round).toBe(1)
      expect(r.effect).toBe('open_planning')
    })

    it('lobby_timeout → cancelled', () => {
      const r = transition(fsm(), { type: 'lobby_timeout' }, cfg)
      expect(r.next.phase).toBe('cancelled')
      expect(r.effect).toBe('cancel')
    })

    it('cancel → cancelled', () => {
      const r = transition(fsm(), { type: 'cancel' }, cfg)
      expect(r.next.phase).toBe('cancelled')
      expect(r.effect).toBe('cancel')
    })

    it('irrelevant event is a no-op (idempotent)', () => {
      const s = fsm()
      const r = transition(s, { type: 'resolve_fail' }, cfg)
      expect(r.changed).toBe(false)
      expect(r.next).toBe(s) // ta sama referencja — brak zmiany
      expect(r.effect).toBeUndefined()
    })
  })

  describe('planning', () => {
    it('close_phase → resolving, effect seal_and_resolve, failCount reset', () => {
      const r = transition(fsm({ phase: 'planning', round: 1, failCount: 2 }), { type: 'close_phase' }, cfg)
      expect(r.next.phase).toBe('resolving')
      expect(r.next.failCount).toBe(0)
      expect(r.effect).toBe('seal_and_resolve')
    })

    it('close_phase does not advance round (round advances after resolve)', () => {
      const r = transition(fsm({ phase: 'planning', round: 3 }), { type: 'close_phase' }, cfg)
      expect(r.next.round).toBe(3)
    })

    it('cancel → cancelled', () => {
      const r = transition(fsm({ phase: 'planning', round: 1 }), { type: 'cancel' }, cfg)
      expect(r.next.phase).toBe('cancelled')
    })

    it('second close_phase after already resolving is a no-op (double trigger safe)', () => {
      const resolving = transition(fsm({ phase: 'planning', round: 1 }), { type: 'close_phase' }, cfg).next
      const again = transition(resolving, { type: 'close_phase' }, cfg)
      expect(again.changed).toBe(false)
      expect(again.next.phase).toBe('resolving')
    })
  })

  describe('resolving — resolve_ok branches', () => {
    it('reveal>0 → revealing, carries pendingFinish=false, effect apply_result_reveal', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1 }), { type: 'resolve_ok', finished: false, revealDurationMs: 1500 }, cfg)
      expect(r.next.phase).toBe('revealing')
      expect(r.next.pendingFinish).toBe(false)
      expect(r.effect).toBe('apply_result_reveal')
    })

    it('reveal>0 AND finished → revealing with pendingFinish=true (finish happens after reveal)', () => {
      const r = transition(fsm({ phase: 'resolving', round: 4 }), { type: 'resolve_ok', finished: true, revealDurationMs: 2000 }, cfg)
      expect(r.next.phase).toBe('revealing')
      expect(r.next.pendingFinish).toBe(true)
    })

    it('reveal=0 and not finished → planning next round, effect apply_result_advance', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1 }), { type: 'resolve_ok', finished: false, revealDurationMs: 0 }, cfg)
      expect(r.next.phase).toBe('planning')
      expect(r.next.round).toBe(2)
      expect(r.effect).toBe('apply_result_advance')
    })

    it('reveal=0 and finished → finished, effect apply_result_finish', () => {
      const r = transition(fsm({ phase: 'resolving', round: 9 }), { type: 'resolve_ok', finished: true, revealDurationMs: 0 }, cfg)
      expect(r.next.phase).toBe('finished')
      expect(r.effect).toBe('apply_result_finish')
    })
  })

  describe('resolving — resolve_fail / retry / pause', () => {
    it('first fail stays resolving with retry_resolve, failCount 1', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1, failCount: 0 }), { type: 'resolve_fail' }, cfg)
      expect(r.next.phase).toBe('resolving')
      expect(r.next.failCount).toBe(1)
      expect(r.effect).toBe('retry_resolve')
    })

    it('second fail stays resolving, failCount 2', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1, failCount: 1 }), { type: 'resolve_fail' }, cfg)
      expect(r.next.phase).toBe('resolving')
      expect(r.next.failCount).toBe(2)
      expect(r.effect).toBe('retry_resolve')
    })

    it('reaching retryMax fails → paused, effect pause', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1, failCount: 2 }), { type: 'resolve_fail' }, cfg)
      expect(r.next.phase).toBe('paused')
      expect(r.next.failCount).toBe(3)
      expect(r.effect).toBe('pause')
    })

    it('cancel during resolving → cancelled', () => {
      const r = transition(fsm({ phase: 'resolving', round: 1 }), { type: 'cancel' }, cfg)
      expect(r.next.phase).toBe('cancelled')
    })
  })

  describe('revealing', () => {
    it('reveal_done without pendingFinish → planning next round', () => {
      const r = transition(fsm({ phase: 'revealing', round: 2, pendingFinish: false }), { type: 'reveal_done' }, cfg)
      expect(r.next.phase).toBe('planning')
      expect(r.next.round).toBe(3)
      expect(r.effect).toBe('open_planning')
    })

    it('reveal_done with pendingFinish → finished (consumes the flag)', () => {
      const r = transition(fsm({ phase: 'revealing', round: 5, pendingFinish: true }), { type: 'reveal_done' }, cfg)
      expect(r.next.phase).toBe('finished')
      expect(r.next.pendingFinish).toBe(false)
      expect(r.effect).toBe('apply_result_finish')
    })

    it('duplicate reveal_done after advancing is a no-op', () => {
      const advanced = transition(fsm({ phase: 'revealing', round: 2 }), { type: 'reveal_done' }, cfg).next
      const again = transition(advanced, { type: 'reveal_done' }, cfg)
      // advanced is now planning; reveal_done nie ma tam sensu
      expect(again.changed).toBe(false)
      expect(again.next.phase).toBe('planning')
    })
  })

  describe('paused', () => {
    it('resume → resolving with retry_resolve, failCount reset', () => {
      const r = transition(fsm({ phase: 'paused', round: 1, failCount: 3 }), { type: 'resume' }, cfg)
      expect(r.next.phase).toBe('resolving')
      expect(r.next.failCount).toBe(0)
      expect(r.effect).toBe('retry_resolve')
    })

    it('pause_timeout → cancelled', () => {
      const r = transition(fsm({ phase: 'paused', round: 1 }), { type: 'pause_timeout' }, cfg)
      expect(r.next.phase).toBe('cancelled')
      expect(r.effect).toBe('cancel')
    })
  })

  describe('terminal states are immutable', () => {
    for (const phase of ['finished', 'cancelled'] as const) {
      it(`${phase}: every event is a no-op`, () => {
        const s = fsm({ phase, round: 3 })
        for (const ev of [
          { type: 'start' }, { type: 'close_phase' }, { type: 'resolve_fail' },
          { type: 'reveal_done' }, { type: 'resume' }, { type: 'cancel' },
        ] as const) {
          const r = transition(s, ev, cfg)
          expect(r.changed).toBe(false)
          expect(r.next.phase).toBe(phase)
        }
      })
    }
  })

  describe('full happy-path sequence (3 rundy, reveal, finish po revealie)', () => {
    it('lobby→planning→resolving→revealing→planning ... →finished', () => {
      let s = fsm()
      s = transition(s, { type: 'start' }, cfg).next
      expect(s.phase).toBe('planning'); expect(s.round).toBe(1)

      s = transition(s, { type: 'close_phase' }, cfg).next
      expect(s.phase).toBe('resolving')

      s = transition(s, { type: 'resolve_ok', finished: false, revealDurationMs: 1000 }, cfg).next
      expect(s.phase).toBe('revealing')

      s = transition(s, { type: 'reveal_done' }, cfg).next
      expect(s.phase).toBe('planning'); expect(s.round).toBe(2)

      s = transition(s, { type: 'close_phase' }, cfg).next
      s = transition(s, { type: 'resolve_ok', finished: true, revealDurationMs: 1000 }, cfg).next
      expect(s.phase).toBe('revealing'); expect(s.pendingFinish).toBe(true)

      s = transition(s, { type: 'reveal_done' }, cfg).next
      expect(s.phase).toBe('finished')
    })
  })

  it('does not mutate the input state object', () => {
    const s = fsm({ phase: 'planning', round: 1, failCount: 1 })
    const snapshot = { ...s }
    transition(s, { type: 'close_phase' }, cfg)
    expect(s).toEqual(snapshot)
  })
})
