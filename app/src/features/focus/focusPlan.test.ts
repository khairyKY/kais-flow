import { describe, expect, it } from 'vitest'
import { blockFor, fillBlock, fitRounds, keptMinutes, oneRound, phaseOf, planSegs, timelineOf, type SessionLike } from './focusPlan'

const S = { focusRoundMin: 25, shortBreakMin: 5, longBreakMin: 20, roundsBeforeLongBreak: 4 }
const at = (hhmm: string) => new Date(`2026-10-31T${hhmm}:00Z`)
const iso = (hhmm: string) => at(hhmm).toISOString()

describe('the block split into rounds', () => {
  it('a 2h block is 4 rounds of 25, 3 short breaks and 5 minutes over (D3)', () => {
    expect(fitRounds(120, S)).toBe(4)
    const segs = planSegs(4, 120, S)
    expect(segs.map((s) => s.k).join('')).toBe('fbfbfbfx')
    expect(segs.reduce((n, s) => n + s.min, 0)).toBe(120)
  })
  it('the cycle\'s last round is followed by the long break', () => {
    const segs = planSegs(5, 180, S)
    expect(segs[7]).toEqual({ k: 'b', min: 20 })
  })
  it('always at least one round, never a trailing break', () => {
    expect(fitRounds(10, S)).toBe(1)
    expect(planSegs(1, 10, S)).toEqual([{ k: 'f', min: 25 }])
  })
})

describe('blockFor — where a session lands', () => {
  const ev = { id: 'e1', title: 'Deep work', starts_at: iso('12:00'), ends_at: iso('14:00'), all_day: false, task_id: 't1', type: 'task' as const, color: null }
  const task = { id: 't1', title: 'Write the outline', scheduled_start: null, scheduled_end: null, duration_min: null }

  it('the task\'s own block: its name, a task block\'s Iris, filled from its start', () => {
    const b = blockFor(task, [ev], S, at('11:00'))
    expect(b).toMatchObject({ title: 'Deep work', start: iso('12:00'), end: iso('14:00'), rounds: 4, fromCalendar: true, eventId: 'e1', color: 'var(--blk-iris)' })
  })
  it('a block under way: the rounds fill what is left of it', () => {
    const b = blockFor(task, [ev], S, at('13:00'))
    expect(b.start).toBe(iso('13:00'))
    expect(b.rounds).toBe(2)
  })
  it('a block\'s own colour', () => {
    expect(blockFor(task, [{ ...ev, color: '#72BF8E' }], S, at('11:00')).color).toBe('var(--blk-fern)')
  })
  it('a task alone: its estimate, or one round of 25, in the default colour', () => {
    expect(blockFor(task, [], S, at('11:00'))).toMatchObject({ rounds: 1, fromCalendar: false, start: iso('11:00'), end: iso('11:25'), color: 'var(--blk-iris)' })
    expect(blockFor({ ...task, duration_min: 60 }, [], S, at('11:00')).rounds).toBe(2)
  })
  it('a Time block\'s "Focus on this"', () => {
    const slot = { ...ev, id: 's1', task_id: null, type: 'time_block' as const, title: 'Admin' }
    expect(blockFor(null, [], S, at('11:00'), slot)).toMatchObject({ title: 'Admin', eventId: 's1', rounds: 4 })
  })
  it('a length chip, then Fill the block again', () => {
    const b = blockFor(task, [ev], S, at('11:00'))
    const one = oneRound(b, 45, at('11:00'))
    expect(one).toMatchObject({ rounds: 1, fill: false, title: 'Deep work' })
    expect(fillBlock(one, S, at('11:00'))).toMatchObject({ rounds: 4, start: iso('12:00'), fill: true })
  })
})

describe('the states on the timeline', () => {
  const block = blockFor(null, [], S, at('12:00'), { id: 'e', title: 'Deep work', starts_at: iso('12:00'), ends_at: iso('14:00'), all_day: false, task_id: null, type: 'time_block', color: null })
  const f = (o: Partial<SessionLike>): SessionLike => ({ mode: 'pomodoro', isRunning: false, secondsLeft: 1500, pomodoroStartIso: null, breakType: 'short', block, kept: 0, ...o })

  it('idle → running → paused', () => {
    expect(phaseOf(f({}), S)).toBe('idle')
    expect(phaseOf(f({ isRunning: true, pomodoroStartIso: iso('12:00') }), S)).toBe('running')
    expect(phaseOf(f({ secondsLeft: 900, pomodoroStartIso: iso('12:00') }), S)).toBe('paused')
  })
  it('bud 2 running: two kept, the third focus segment a quarter through', () => {
    const t = timelineOf(f({ isRunning: true, kept: 2, secondsLeft: 1125, pomodoroStartIso: iso('13:00') }), S)!
    expect(t).toMatchObject({ cur: 4, done: 2, phase: 'running' })
    expect(t.frac).toBeCloseTo(0.25)
    expect(keptMinutes(f({ kept: 2, secondsLeft: 1125, pomodoroStartIso: iso('13:00') }), S)).toBe(56)
  })
  it('a break under way is the break segment after the kept round', () => {
    const t = timelineOf(f({ mode: 'break', isRunning: true, kept: 3, secondsLeft: 252 }), S)!
    expect(t).toMatchObject({ cur: 5, phase: 'break' })
  })
  it('a break waiting to start is the round\'s end', () => {
    expect(phaseOf(f({ mode: 'break', kept: 2, secondsLeft: 300 }), S)).toBe('end')
  })
  it('every round kept: done for the day', () => {
    expect(phaseOf(f({ kept: 4 }), S)).toBe('done')
  })
})
