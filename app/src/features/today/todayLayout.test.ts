import { describe, expect, it } from 'vitest'
import { blockMeta, blockOf, dayOfJourney, eventMetas, focusedToday, foldOpen, remainingWork, runningBlock, topCard, upNextItems, workloadLine, type Block, type WorkloadInput } from './todayLayout'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-27 (EEST) — the design's sample day.
const at = (cairoHHMM: string) => {
  const [h, m] = cairoHHMM.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, 27, h - 3, m))
}
const iso = (hhmm: string) => at(hhmm).toISOString()
const block = (id: string, from: string, to: string, task_id: string | null = null): Block => ({ id, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id })

// Today Phone's sample day: deep work 09:00–10:30, the goal's block 13:30–15:00, a call, the gym.
const DEEP = block('deep', '09:00', '10:30')
const GOAL = block('goal-block', '13:30', '15:00', 'goal')
const CALL = block('call', '15:00', '15:30')
const GYM = block('gym', '18:00', '19:00')
const DAY = [GYM, CALL, GOAL, DEEP]
const none = new Set<string>()

describe('runningBlock — the NOW slip only while a block runs', () => {
  it('09:40: deep work is running', () => {
    expect(runningBlock(DAY, at('09:40'), none)?.id).toBe('deep')
  })
  it('nothing running → no slip (before, between, at the end minute)', () => {
    expect(runningBlock(DAY, at('08:59'), none)).toBeNull()
    expect(runningBlock(DAY, at('10:30'), none)).toBeNull()
    expect(runningBlock(DAY, at('13:10'), none)).toBeNull()
  })
  it("a block whose task is done isn't running any more", () => {
    expect(runningBlock(DAY, at('14:00'), new Set(['goal']))).toBeNull()
    expect(runningBlock(DAY, at('14:00'), none)?.id).toBe('goal-block')
  })
  it('overlapping blocks: the one that started last', () => {
    expect(runningBlock([...DAY, block('standup', '09:30', '09:45')], at('09:40'), none)?.id).toBe('standup')
  })
  it('all-day events never run the slip', () => {
    expect(runningBlock([{ ...DEEP, all_day: true }], at('09:40'), none)).toBeNull()
  })
})

describe('topCard — slip and ritual card never together', () => {
  it('a running block wins over any ritual', () => {
    expect(topCard('plan', DEEP, false)).toBe('slip')
    expect(topCard('shutdown', DEEP, false)).toBe('slip')
  })
  it('the ritual card comes back when the block ends; none during the day', () => {
    expect(topCard('plan', null, false)).toBe('plan')
    expect(topCard('shutdown', null, false)).toBe('shutdown')
    expect(topCard('closed', null, false)).toBe('closed')
    expect(topCard('now', null, false)).toBeNull()
  })
  it('an empty day shows neither', () => {
    expect(topCard('plan', null, true)).toBeNull()
  })
})

describe('upNextItems — each item once', () => {
  const top3 = new Set(['goal'])
  it('09:40 (2b): the slip block and the Top 3 block are skipped', () => {
    const slip = runningBlock(DAY, at('09:40'), none)
    expect(upNextItems(DAY, at('09:40'), slip, top3).map((e) => e.id)).toEqual(['call', 'gym'])
  })
  it('07:40 (2a): no slip, deep work leads', () => {
    expect(upNextItems(DAY, at('07:40'), null, top3).map((e) => e.id)).toEqual(['deep', 'call', 'gym'])
  })
  it('19:30 (2d): nothing left → empty (the page says so)', () => {
    expect(upNextItems(DAY, at('19:30'), null, top3)).toEqual([])
  })
  it("a second block running beside the slip's stays listed", () => {
    const both = [...DAY, block('standup', '09:30', '09:45')]
    const slip = runningBlock(both, at('09:40'), none)
    expect(upNextItems(both, at('09:40'), slip, top3).map((e) => e.id)).toEqual(['deep', 'call', 'gym'])
  })
})

describe('blockOf / blockMeta — the Top 3 row carries its block', () => {
  it("finds the task's block that hasn't ended", () => {
    expect(blockOf('goal', DAY, at('09:40'))?.id).toBe('goal-block')
    expect(blockOf('goal', DAY, at('15:00'))).toBeNull()
  })
  it('far off: range + length (2b)', () => {
    expect(blockMeta(GOAL, at('09:40'))).toEqual(['13:30–15:00', '1H30M'])
  })
  it('within 30 minutes: starts in (2c)', () => {
    expect(blockMeta(GOAL, at('13:10'))).toEqual(['13:30–15:00', 'starts in 20M'])
  })
  it('running: Now (a Top 3 task that is also the slip keeps its row, marked)', () => {
    expect(blockMeta(GOAL, at('14:00'))).toEqual(['13:30–15:00', 'Now'])
  })
})

describe('eventMetas — ruling 5 rows', () => {
  it('the first still to come says how far off it is (2a)', () => {
    expect(eventMetas([DEEP, CALL, GYM], at('07:40'))).toEqual([['1H30M', 'in 1H20M'], ['30M'], ['1H']])
  })
  it('a running row reads Now and the next one gets the countdown', () => {
    expect(eventMetas([DEEP, CALL], at('09:40'))).toEqual([['1H30M', 'Now'], ['30M', 'in 5H20M']])
  })
})

describe('foldOpen', () => {
  it('drops Top 3 and anything the slip or Up next already shows', () => {
    const rows = [{ id: 'goal' }, { id: 'milk' }, { id: 'gym-task' }, { id: 'omar' }]
    const shown = [block('g', '18:00', '19:00', 'gym-task')]
    expect(foldOpen(rows, new Set(['goal']), shown).map((r) => r.id)).toEqual(['milk', 'omar'])
  })
})

describe('remainingWork', () => {
  it('open Top 3 (block time or duration) + other blocks still to come; finish not before the last block', () => {
    const r = remainingWork([{ id: 'goal', duration_min: 120 }, { id: 'review', duration_min: 30 }], DAY, at('09:40'), none)
    // goal block 90 + review 30 + deep's last 50 + call 30 + gym 60
    expect(r.minutes).toBe(260)
    expect(r.finishAt.toISOString()).toBe(iso('19:00'))
  })
  it("finish = now + work when that's later, rounded up to 10 minutes", () => {
    const r = remainingWork([{ id: 'a', duration_min: 125 }], [], at('13:10'), none)
    expect(r.minutes).toBe(125)
    expect(r.finishAt.toISOString()).toBe(iso('15:20'))
  })
  it("a done task's block doesn't count", () => {
    const r = remainingWork([], [block('x', '15:00', '16:00', 't')], at('13:00'), new Set(['t']))
    expect(r.minutes).toBe(0)
  })
})

describe('dayOfJourney — "Day N" holds all day', () => {
  const first = new Date(Date.UTC(2026, 6, 6, 6)).toISOString() // 09:00 Cairo, 6 Jul
  it('the first day is Day 1; 83 days on is Day 84, morning and night alike', () => {
    expect(dayOfJourney(first, new Date(Date.UTC(2026, 6, 6, 20)))).toBe(1)
    expect(dayOfJourney(first, at('07:40'))).toBe(84)
    expect(dayOfJourney(first, at('21:50'))).toBe(84)
  })
  it('turns at Cairo midnight, not UTC midnight', () => {
    expect(dayOfJourney(first, new Date(Date.UTC(2026, 8, 27, 21, 30)))).toBe(85) // 00:30 Cairo on the 28th
  })
  it('no records yet → Day 1', () => expect(dayOfJourney(null, at('08:15'))).toBe(1))
})

describe('focusedToday', () => {
  it("sums today's Cairo-date entries only", () => {
    const entries = [
      { started_at: iso('09:00'), duration_min: 50 },
      { started_at: iso('14:00'), duration_min: 80 },
      { started_at: new Date(Date.UTC(2026, 8, 26, 20, 30)).toISOString(), duration_min: 40 }, // 23:30 Cairo the day before
    ]
    expect(focusedToday(entries, at('19:30'))).toBe(130)
  })
})

describe('workloadLine — header by state (Today Phone 2a–2i)', () => {
  const base: WorkloadInput = { day: 84, phase: 'now', empty: false, top3: { picked: 3, done: 0 }, top3DoneAt: null, doneToday: 0, remaining: { minutes: 0, finishAt: at('17:30') }, focusedMin: 0 }
  const line = (o: Partial<WorkloadInput>) => workloadLine({ ...base, ...o })
  it('2f empty', () => expect(line({ day: 1, empty: true, phase: 'plan' })).toBe('Day 1 · a fresh page'))
  it('2a not planned', () => expect(line({ phase: 'plan' })).toBe('Day 84 · not planned yet'))
  it('2b planned, nothing done yet', () => expect(line({ remaining: { minutes: 300, finishAt: at('17:30') } })).toBe("Day 84 · ~5h planned · you'll finish ~17:30"))
  it('2c something done → left', () => expect(line({ doneToday: 1, top3: { picked: 3, done: 1 }, remaining: { minutes: 170, finishAt: at('17:30') } })).toBe("Day 84 · ~3h left · you'll finish ~17:30"))
  it('under an hour left', () => expect(line({ doneToday: 1, remaining: { minutes: 45, finishAt: at('14:00') } })).toBe("Day 84 · ~45m left · you'll finish ~14:00"))
  it('2i all three done', () => expect(line({ top3: { picked: 3, done: 3 }, top3DoneAt: iso('16:20'), doneToday: 3 })).toBe('Day 84 · all three done by 16:20'))
  it('fewer than three picked, all done', () => expect(line({ top3: { picked: 2, done: 2 }, top3DoneAt: iso('11:05') })).toBe('Day 84 · Top 3 done by 11:05'))
  it('2d shut down', () => expect(line({ phase: 'shutdown', top3: { picked: 3, done: 2 }, focusedMin: 130 })).toBe('Day 84 · 2 of 3 done · 2h 10m focused'))
  it('2e day closed', () => expect(line({ phase: 'closed', doneToday: 4, focusedMin: 130 })).toBe('Day 84 · 4 done · 2h 10m focused'))
  it('nothing timed and nothing left to measure', () => expect(line({ top3: { picked: 0, done: 0 }, doneToday: 2 })).toBe('Day 84 · 2 done'))
})
