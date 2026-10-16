import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blockMeta, blockOf, dayCounts, dayOfJourney, eventMetas, focusedToday, foldOpen, overCapacity, projectTag, remainingWork, reviewDue, ribbonPct, ribbonSpan, runningBlock, top3Planned, topCard, upNextItems, workloadLine, type Block, type WorkloadInput } from './todayLayout'
import { firstCreatedAt } from './journey'
import { claimDayComplete, DAY_DONE_KEY } from './dayComplete'
import { setAppZone } from '../../lib/appZone'
import type { Task } from '../../lib/types'

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
  it('something under way wins over any ritual: running, over, paused, just done', () => {
    for (const k of ['running', 'over', 'paused', 'done'] as const) {
      expect(topCard('plan', k, false)).toBe('slip')
      expect(topCard('shutdown', k, false)).toBe('slip')
    }
  })
  it('the ritual card comes back when nothing runs; nothing during an idle day', () => {
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
    expect(blockMeta(GOAL, at('09:40'))).toEqual(['13:30–15:00', '1h\u00a030m'])
  })
  it('within 30 minutes: starts in (2c)', () => {
    expect(blockMeta(GOAL, at('13:10'))).toEqual(['13:30–15:00', 'starts in 20m'])
  })
  it('running: Now (a Top 3 task that is also the slip keeps its row, marked)', () => {
    expect(blockMeta(GOAL, at('14:00'))).toEqual(['13:30–15:00', 'Now'])
  })
})

describe('eventMetas — ruling 5 rows', () => {
  it('the first still to come says how far off it is (2a)', () => {
    expect(eventMetas([DEEP, CALL, GYM], at('07:40'))).toEqual([['1h\u00a030m', 'in 1h\u00a020m'], ['30m'], ['1h']])
  })
  it('a running row reads Now and the next one gets the countdown', () => {
    expect(eventMetas([DEEP, CALL], at('09:40'))).toEqual([['1h\u00a030m', 'Now'], ['30m', 'in 5h\u00a020m']])
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

describe('overCapacity — MK Workload amber', () => {
  it('fits: 0', () => {
    expect(overCapacity([{ id: 'goal', duration_min: 120 }], DAY, at('09:40'), none)).toBe(0)
  })
  it("more work than what's left of 09:00–18:00 → the minutes over", () => {
    // 16:00: 2h left in the working day; 4h of picks + the call (gone) → 2h over
    expect(overCapacity([{ id: 'a', duration_min: 120 }, { id: 'b', duration_min: 120 }], DAY, at('16:00'), none)).toBe(120)
  })
  it('an evening block (the 18:00 gym) is not workload', () => {
    expect(overCapacity([], DAY, at('17:30'), none)).toBe(0)
  })
  it('before 09:00 the day is measured from 09:00', () => {
    // 9h of capacity; the goal's block 90 (not its 60m estimate) + x 420 + deep 90 + call 30 = 630 → 90 over
    expect(overCapacity([{ id: 'goal', duration_min: 60 }, { id: 'x', duration_min: 420 }], DAY, at('07:00'), none)).toBe(90)
  })
})

describe('dayCounts — "2 of 6 done"', () => {
  const now = at('12:00')
  const t = (id: string, over: Partial<Task> = {}) => ({ id, title: id, status: 'todo', top3: false, someday: false, deleted_at: null, due_at: null, scheduled_start: null, completed_at: null, ...over }) as Task
  it("today's plate + what was finished today; the overdue pile and undated backlog aren't counted", () => {
    const tasks = [
      t('pick', { top3: true }), // undated pick: today's
      t('due', { due_at: iso('09:00') }),
      t('block', { scheduled_start: iso('15:00') }),
      t('done', { status: 'done', completed_at: iso('10:00') }),
      t('old', { due_at: new Date(Date.UTC(2026, 8, 20, 6)).toISOString() }), // overdue → its own fold
      t('carried', { top3: true, due_at: new Date(Date.UTC(2026, 8, 26, 6)).toISOString() }), // yesterday's pick, still today's
      t('backlog'),
      t('later', { due_at: new Date(Date.UTC(2026, 8, 30, 6)).toISOString() }),
    ]
    expect(dayCounts(tasks, now)).toEqual({ done: 1, total: 5 })
  })
})

describe('ribbon — 8 AM–8 PM on the user clock', () => {
  it('places and clips blocks; off-ribbon ones are null', () => {
    const deep = ribbonSpan(DEEP, at('09:40'))!
    expect(deep.left).toBeCloseTo((60 / 720) * 100)
    expect(deep.width).toBeCloseTo((90 / 720) * 100)
    const early = ribbonSpan(block('early', '07:00', '08:30'), at('09:40'))!
    expect(early.left).toBe(0)
    expect(early.width).toBeCloseTo((30 / 720) * 100)
    expect(ribbonSpan(block('late', '20:00', '21:00'), at('09:40'))).toBeNull()
    expect(ribbonSpan({ ...DEEP, all_day: true }, at('09:40'))).toBeNull()
  })
  it('the now line', () => {
    expect(ribbonPct(at('14:00').getTime(), at('14:00'))).toBe(50)
    expect(ribbonPct(at('06:00').getTime(), at('06:00'))).toBe(0)
  })
})

describe('reviewDue — the weekly review on the first day of the weekend', () => {
  // 2026-09-25 is a Friday, the 26th a Saturday, the 27th a Sunday (Cairo).
  const fri = new Date(Date.UTC(2026, 8, 25, 7))
  const sat = new Date(Date.UTC(2026, 8, 26, 7))
  it("Kai's Fri + Sat → Friday; the default Sat + Sun → Saturday; Sun only → Sunday", () => {
    expect(reviewDue(fri, [5, 6], [])).toBe(true)
    expect(reviewDue(sat, [5, 6], [])).toBe(false)
    expect(reviewDue(sat, [0, 6], [])).toBe(true)
    expect(reviewDue(at('09:00'), [0], [])).toBe(true)
    expect(reviewDue(fri, [0, 6], [])).toBe(false)
  })
  // Fri + Sat: the review week runs Sun 20 – Sat 26 Sep (rituals/reviewWeek); the Weekly review keys
  // each close/reopen row with its week. A row from before that key counts for the week it was written in.
  const ev = (event_type: string, iso: string, week?: string) => ({ event_type, created_at: iso, payload: week ? { week } : {} })
  const closed = (iso: string, week?: string) => ev('review.week_closed', iso, week)
  it("hidden once this week's review is closed (that day or earlier in the week), back next week", () => {
    expect(reviewDue(fri, [5, 6], [closed('2026-09-25T06:00:00Z', '2026-09-20')])).toBe(false)
    expect(reviewDue(fri, [5, 6], [closed('2026-09-23T18:00:00Z', '2026-09-20')])).toBe(false)
    expect(reviewDue(fri, [5, 6], [closed('2026-09-23T18:00:00Z')])).toBe(false) // no week on the row: the one it was written in
    expect(reviewDue(fri, [5, 6], [closed('2026-09-18T18:00:00Z', '2026-09-13')])).toBe(true)
  })
  it('Undo on "Close the week" brings the prompt back; the latest of close / reopen wins (A29)', () => {
    const c = closed('2026-09-25T06:00:00Z', '2026-09-20')
    const undo = ev('review.week_reopened', '2026-09-25T06:00:04Z', '2026-09-20')
    expect(reviewDue(fri, [5, 6], [c, undo])).toBe(true)
    expect(reviewDue(fri, [5, 6], [c, undo, closed('2026-09-25T06:30:00Z', '2026-09-20')])).toBe(false)
  })
  it("a late close — last week's, made on Saturday or at 00:30 Sunday — never hides this Friday's (A29)", () => {
    // Before: any close in the last seven days hid it, and Saturday 19th is six days before Friday 25th.
    expect(reviewDue(fri, [5, 6], [closed('2026-09-19T10:00:00Z', '2026-09-13')])).toBe(true)
    expect(reviewDue(fri, [5, 6], [closed('2026-09-19T10:00:00Z')])).toBe(true) // Sat 13:00, no week on the row
    expect(reviewDue(fri, [5, 6], [closed('2026-09-19T21:30:00Z')])).toBe(true) // Sun 00:30 = still Saturday's loop day
  })
  it('no weekend (or all seven days) → no review day', () => {
    expect(reviewDue(fri, [], [])).toBe(false)
    expect(reviewDue(fri, [0, 1, 2, 3, 4, 5, 6], [])).toBe(false)
  })
  it("the day is the user's loop day (04:00 rollover, Cairo here): Friday from 04:00 to 04:00 Saturday", () => {
    expect(reviewDue(new Date('2026-09-25T01:00:00Z'), [5, 6], [])).toBe(true) // Fri 04:00 Cairo
    expect(reviewDue(new Date('2026-09-24T21:30:00Z'), [5, 6], [])).toBe(false) // Fri 00:30 — still Thursday's loop day
    expect(reviewDue(new Date('2026-09-25T21:30:00Z'), [5, 6], [])).toBe(true) // Sat 00:30 — still Friday's
    expect(reviewDue(new Date('2026-09-26T01:00:00Z'), [5, 6], [])).toBe(false) // Sat 04:00
  })
})

describe('top3Planned — "1h 30m planned"', () => {
  it("each pick's block length today, else its duration", () => {
    expect(top3Planned([{ id: 'goal', duration_min: 30 }, { id: 'b', duration_min: 30 }, { id: 'c', duration_min: null }], DAY, at('09:40'))).toBe(90 + 30)
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

describe('projectTag — Plan a step files into that project', () => {
  const projects = [{ id: 'p1', name: 'Shaheen website' }, { id: 'p2', name: 'Forecasting App' }, { id: 'p3', name: 'App store listing' }]
  it("the name's first word when it lands on the project", () => expect(projectTag(projects[1], projects)).toBe('#Forecasting'))
  it("skips a word an earlier project's name also holds", () => {
    // "app" is in "Forecasting App" (listed first), so #App would file into the wrong project.
    expect(projectTag(projects[2], projects)).toBe('#store')
  })
})

describe('journey — Day 1 is the first record', () => {
  it('firstCreatedAt: the earliest across every list; none → null', () => {
    expect(firstCreatedAt([{ created_at: '2026-07-09T10:00:00Z' }], [], [{ created_at: '2026-07-06T06:00:00Z' }])).toBe('2026-07-06T06:00:00Z')
    expect(firstCreatedAt([], [])).toBeNull()
  })
})

describe("claimDayComplete — once per the user's day", () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setAppZone('Africa/Cairo')
  })
  it("keys on the user's zone, whatever the device's", () => {
    setAppZone('Pacific/Kiritimati') // UTC+14: 12:00Z on the 13th is already the 14th there
    const noon = new Date(Date.UTC(2026, 9, 13, 12))
    expect(claimDayComplete(noon)).toBe(true)
    expect(store.get(DAY_DONE_KEY)).toBe('2026-10-14')
    expect(claimDayComplete(new Date(Date.UTC(2026, 9, 13, 13)))).toBe(false) // same user day
  })
})
