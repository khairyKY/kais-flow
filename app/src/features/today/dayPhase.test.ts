import { describe, expect, it } from 'vitest'
import { cairoMinutes, dayPhase, eveningState, isPlanned, morningState, ritualFinished, type DayPhaseInput } from './dayPhase'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-26 (EEST).
const at = (cairoHHMM: string) => {
  const [h, m] = cairoHHMM.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, 26, h - 3, m))
}

const MORNING = { done: 0, total: 4 }
const EVENING = { done: 0, total: 5 }
const standup = { id: 'standup' }
const goal = { id: 'goal' }

const input = (over: Partial<DayPhaseInput<typeof standup, typeof goal>> = {}): DayPhaseInput<typeof standup, typeof goal> => ({
  now: at('08:00'),
  morning: MORNING,
  evening: EVENING,
  top3: { picked: 0, done: 0 },
  nextUp: null,
  firstOpenTop3: null,
  ...over,
})

describe('cairoMinutes', () => {
  it('reads Cairo wall-clock minutes whatever the device zone', () => {
    expect(cairoMinutes(at('00:00'))).toBe(0)
    expect(cairoMinutes(at('08:30'))).toBe(8 * 60 + 30)
    expect(cairoMinutes(at('23:59'))).toBe(23 * 60 + 59)
  })
  it('follows Cairo winter time too (UTC+2)', () => {
    expect(cairoMinutes(new Date('2026-01-15T06:00:00Z'))).toBe(8 * 60)
  })
})

describe('dayPhase — Plan', () => {
  it('not planned, morning → Plan your day', () => {
    expect(dayPhase(input()).phase).toBe('plan')
  })
  it('stays Plan until 16:59 when nothing is planned', () => {
    expect(dayPhase(input({ now: at('16:59') })).phase).toBe('plan')
  })
  it('from 17:00 an unplanned day stops asking to plan (17:00–18:00 shows Now)', () => {
    expect(dayPhase(input({ now: at('17:00') })).phase).toBe('now')
  })
  it('Top 3 picked before noon is not yet "planned" — the ritual still invites', () => {
    expect(dayPhase(input({ now: at('11:59'), top3: { picked: 2, done: 0 } })).phase).toBe('plan')
  })
})

describe('dayPhase — Now', () => {
  it('the morning ritual finished → Now, even at 08:00', () => {
    expect(dayPhase(input({ morning: { done: 4, total: 4 } })).phase).toBe('now')
  })
  it('≥1 Top 3 picked and 12:00 or later counts as planned', () => {
    expect(dayPhase(input({ now: at('12:00'), top3: { picked: 1, done: 0 } })).phase).toBe('now')
  })
  it('shows the running or next Up next item first', () => {
    expect(dayPhase(input({ morning: { done: 4, total: 4 }, nextUp: standup, firstOpenTop3: goal }))).toEqual({ phase: 'now', item: { kind: 'event', event: standup } })
  })
  it('with nothing on the clock, the first unfinished Top 3', () => {
    expect(dayPhase(input({ morning: { done: 4, total: 4 }, firstOpenTop3: goal }))).toEqual({ phase: 'now', item: { kind: 'task', task: goal } })
  })
  it('with neither, an empty Now', () => {
    expect(dayPhase(input({ morning: { done: 4, total: 4 } }))).toEqual({ phase: 'now', item: null })
  })
})

describe('dayPhase — Shut down', () => {
  it('18:00 or later → Shut down the day, planned or not', () => {
    expect(dayPhase(input({ now: at('18:00') })).phase).toBe('shutdown')
    expect(dayPhase(input({ now: at('19:00'), morning: { done: 4, total: 4 } })).phase).toBe('shutdown')
    expect(dayPhase(input({ now: at('17:59'), morning: { done: 4, total: 4 } })).phase).toBe('now')
  })
  it('every picked Top 3 done → Shut down, whatever the hour', () => {
    expect(dayPhase(input({ now: at('11:00'), morning: { done: 4, total: 4 }, top3: { picked: 3, done: 3 } })).phase).toBe('shutdown')
  })
  it('a Top 3 still open keeps the day in Now', () => {
    expect(dayPhase(input({ now: at('15:00'), morning: { done: 4, total: 4 }, top3: { picked: 3, done: 2 } })).phase).toBe('now')
  })
  it('nothing picked is not "all done"', () => {
    expect(dayPhase(input({ now: at('15:00'), top3: { picked: 0, done: 0 } })).phase).toBe('plan')
  })
  it('a part-walked evening ritual still reads Shut down', () => {
    expect(dayPhase(input({ now: at('21:00'), evening: { done: 3, total: 5 } })).phase).toBe('shutdown')
  })
})

describe('dayPhase — Day closed', () => {
  it('the evening ritual finished → Day closed, from any other state', () => {
    const closed = { done: 5, total: 5 }
    expect(dayPhase(input({ now: at('21:00'), evening: closed })).phase).toBe('closed')
    expect(dayPhase(input({ now: at('08:00'), evening: closed })).phase).toBe('closed')
    expect(dayPhase(input({ now: at('15:00'), evening: closed, top3: { picked: 3, done: 3 } })).phase).toBe('closed')
  })
})

describe('dayPhase — R4-5a pins', () => {
  it('an unpinned morning ritual is never prompted — the card shows Now instead', () => {
    expect(dayPhase(input({ prompts: { morning: false, evening: true } })).phase).toBe('now')
  })
  it('an unpinned evening ritual is never prompted, but a finished one still closes the day', () => {
    expect(dayPhase(input({ now: at('19:00'), prompts: { morning: true, evening: false } })).phase).toBe('now')
    expect(dayPhase(input({ now: at('19:00'), prompts: { morning: true, evening: false }, evening: { done: 5, total: 5 } })).phase).toBe('closed')
  })
})

describe('isPlanned / ritualFinished', () => {
  it('finished means every step, unless the ritual says otherwise', () => {
    expect(ritualFinished({ done: 3, total: 4 })).toBe(false)
    expect(ritualFinished({ done: 4, total: 4 })).toBe(true)
    expect(ritualFinished({ done: 4, total: 5, finished: true })).toBe(true)
    expect(ritualFinished({ done: 0, total: 0 })).toBe(false)
  })
  it('planned by the ritual or by Top 3 after noon', () => {
    expect(isPlanned({ now: at('09:00'), morning: { done: 4, total: 4 }, top3: { picked: 0, done: 0 } })).toBe(true)
    expect(isPlanned({ now: at('13:00'), morning: { done: 0, total: 4 }, top3: { picked: 1, done: 0 } })).toBe(true)
    expect(isPlanned({ now: at('13:00'), morning: { done: 0, total: 4 }, top3: { picked: 0, done: 0 } })).toBe(false)
  })
})

describe('morningState — the time-block step that cannot log itself', () => {
  const walked = new Set(['overdue', 'top3', 'inbox'])
  it('a walked ritual plus a task block today reads 4/4 and finished', () => {
    const s = morningState(walked, 4, true)
    expect(s).toEqual({ done: 4, total: 4 })
    expect(ritualFinished(s)).toBe(true)
  })
  it('walked but nothing blocked onto today stays 3/4', () => {
    expect(ritualFinished(morningState(walked, 4, false))).toBe(false)
  })
  it('an unopened ritual never borrows the calendar: 0/4 even with a block today', () => {
    expect(morningState(new Set(), 4, true)).toEqual({ done: 0, total: 4 })
  })
  it('a ritual that logs the step itself is not double-counted', () => {
    expect(morningState(new Set([...walked, 'block']), 4, true).done).toBe(4)
  })
})

describe('eveningState', () => {
  it('Done on the last beat closes the garden even with the sweep skipped', () => {
    const s = eveningState(new Set(['garden', 'line', 'seeds', 'goodnight']), 5)
    expect(s.done).toBe(4)
    expect(ritualFinished(s)).toBe(true)
  })
  it('four beats without goodnight is not finished', () => {
    expect(ritualFinished(eveningState(new Set(['sweep', 'garden', 'line', 'seeds']), 5))).toBe(false)
  })
  it('all five beats is finished', () => {
    expect(ritualFinished(eveningState(new Set(['sweep', 'garden', 'line', 'seeds', 'goodnight']), 5))).toBe(true)
  })
})
