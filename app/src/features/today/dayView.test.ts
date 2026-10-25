import { describe, expect, it } from 'vitest'
import { captureFor, dayBlocks, dayBounds, dayHeading, dayName, dayNoon, dayWord, futureTasks, isOnDay, pastTasks, viewDay } from './dayView'
import { liveSeeds, seedPayload, seededTaskIds, SEED_EVENT, UNSEED_EVENT } from '../rituals/loopDay'
import { parseCommand } from '../command-bar/parseCommand'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { ActivityLogEntry, CalendarEvent, Task } from '../../lib/types'

// Every zone is passed explicitly, so these hold whatever the machine's TZ (the gate runs them under
// Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo). Cairo is UTC+3 on these dates (EEST).
const CAIRO = 'Africa/Cairo'
const cairo = (day: number, hhmm: string, month = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month - 1, day, h - 3, m)).toISOString()
}
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, completed_at: null, top3: false, top3_rank: null, someday: false, paused: false, deleted_at: null, ...over }) as Task
const block = (id: string, from: string, to: string, over: Partial<CalendarEvent> = {}) => ({ id, starts_at: from, ends_at: to, all_day: false, deleted_at: null, ...over })

describe('viewDay — which day ?day= asks for', () => {
  it('today, nothing, junk or an impossible date all mean today', () => {
    expect(viewDay(null, '2026-10-25')).toBeNull()
    expect(viewDay('2026-10-25', '2026-10-25')).toBeNull()
    expect(viewDay('tomorrow', '2026-10-25')).toBeNull()
    expect(viewDay('2026-02-31', '2026-10-25')).toBeNull()
    expect(viewDay('2026-1-3', '2026-10-25')).toBeNull()
  })
  it('any real other day is that day, past or future', () => {
    expect(viewDay('2026-11-03', '2026-10-25')).toBe('2026-11-03')
    expect(viewDay('2026-10-20', '2026-10-25')).toBe('2026-10-20')
  })
})

describe('the day on the user clock', () => {
  it("noon on the day is that day in the user's zone", () => {
    for (const zone of [CAIRO, 'UTC', 'America/Los_Angeles', 'Asia/Tokyo']) expect(zoneDateKey(dayNoon('2026-11-03', zone), zone)).toBe('2026-11-03')
  })
  it('bounds run midnight to midnight, a DST day 25 or 23 hours', () => {
    const { start, end } = dayBounds('2026-11-03', CAIRO)
    expect(start.toISOString()).toBe('2026-11-02T22:00:00.000Z') // Cairo is back on UTC+2 by November
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000)
    const fallBack = dayBounds('2026-11-01', 'America/Los_Angeles')
    expect(fallBack.end.getTime() - fallBack.start.getTime()).toBe(25 * 3_600_000)
    const springOn = dayBounds('2026-03-08', 'America/Los_Angeles')
    expect(springOn.end.getTime() - springOn.start.getTime()).toBe(23 * 3_600_000)
  })
})

describe('which tasks belong to day X', () => {
  const late = task('late', { due_at: cairo(27, '23:30') }) // 20:30 UTC — still the 27th in Cairo
  it('due that day, by the user zone — not the device or UTC', () => {
    expect(isOnDay(late, '2026-10-27', CAIRO)).toBe(true)
    expect(isOnDay(late, '2026-10-28', 'Asia/Tokyo')).toBe(true) // 05:30 on the 28th in Tokyo
    expect(isOnDay(late, '2026-10-27', 'Asia/Tokyo')).toBe(false)
  })
  it('on its calendar that day counts even when it is due another day', () => {
    expect(isOnDay(task('b', { due_at: cairo(30, '09:00'), scheduled_start: cairo(27, '10:00') }), '2026-10-27', CAIRO)).toBe(true)
  })
  it('a future day lists its open work in time order; done, parked, binned and paused stay off', () => {
    const rows = [
      task('noon', { due_at: cairo(27, '12:00') }),
      task('nine', { scheduled_start: cairo(27, '09:00') }),
      task('done', { due_at: cairo(27, '08:00'), status: 'done', completed_at: cairo(26, '20:00') }),
      task('someday', { due_at: cairo(27, '08:00'), someday: true }),
      task('binned', { due_at: cairo(27, '08:00'), deleted_at: cairo(25, '08:00') }),
      task('paused', { due_at: cairo(27, '08:00'), paused: true }),
      task('other day', { due_at: cairo(28, '08:00') }),
      task('undated'),
    ]
    expect(futureTasks(rows, '2026-10-27', CAIRO).map((t) => t.id)).toEqual(['nine', 'noon'])
  })
  it("a past day: what was finished on it (that day's picks first), and what was on it and is still open", () => {
    const rows = [
      task('evening', { status: 'done', completed_at: cairo(20, '21:00') }),
      task('goal', { status: 'done', completed_at: cairo(20, '15:00'), top3_rank: 1 }),
      task('morning', { status: 'done', completed_at: cairo(20, '08:00') }),
      task('after midnight', { status: 'done', completed_at: cairo(21, '00:30') }),
      task('left', { due_at: cairo(20, '09:00') }),
      task('cancelled', { status: 'cancelled', completed_at: cairo(20, '10:00') }),
    ]
    const { done, open } = pastTasks(rows, '2026-10-20', CAIRO)
    expect(done.map((t) => t.id)).toEqual(['goal', 'morning', 'evening'])
    expect(open.map((t) => t.id)).toEqual(['left'])
  })
})

describe("the day's blocks", () => {
  it('timed blocks touching the day, in start order; all-day and deleted ones stay off', () => {
    const events = [
      block('noon', cairo(27, '12:00'), cairo(27, '13:00')),
      block('overnight', cairo(26, '23:00'), cairo(27, '01:00')),
      block('allday', cairo(27, '00:00'), cairo(28, '00:00'), { all_day: true }),
      block('gone', cairo(27, '10:00'), cairo(27, '11:00'), { deleted_at: cairo(26, '09:00') }),
      block('tomorrow', cairo(28, '00:00'), cairo(28, '01:00')),
    ]
    expect(dayBlocks(events, '2026-10-27', CAIRO).map((e) => e.id)).toEqual(['overnight', 'noon'])
    expect(dayBlocks(events, '2026-10-26', CAIRO).map((e) => e.id)).toEqual(['overnight'])
  })
})

describe("a future day's 3 are the evening ritual's seeds for that date", () => {
  const row = (n: number, type: string, id: string, forDate: string): ActivityLogEntry =>
    ({ id: `a${n}`, event_type: type, entity_type: 'task', entity_id: id, payload: { ...seedPayload(new Date(cairo(25, '10:00')), forDate) }, created_at: cairo(25, `10:0${n}`) }) as ActivityLogEntry
  it('planting for Nov 3 is read back for Nov 3 only — not tomorrow, not the next morning', () => {
    const rows = [row(1, SEED_EVENT, 'a', '2026-11-03'), row(2, SEED_EVENT, 'b', '2026-11-03'), row(3, SEED_EVENT, 'c', '2026-10-26'), row(4, UNSEED_EVENT, 'b', '2026-11-03')]
    expect(seededTaskIds(rows, '2026-11-03')).toEqual(['a'])
    expect(seededTaskIds(rows, '2026-10-26')).toEqual(['c'])
  })
  it("the evening's own seed still defaults to the next morning", () => {
    expect(seedPayload(new Date(cairo(25, '21:00'))).for_date).toBe('2026-10-26')
  })
  it('a day keeps at most three, open ones', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id))
    expect(liveSeeds(['a', 'b', 'c', 'd'], tasks).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('names', () => {
  it("the header's date in Today's two styles, the year only when it isn't this one", () => {
    expect(dayHeading('2026-11-03', '2026-10-25', 'long')).toBe('Tuesday, November 3')
    expect(dayHeading('2026-11-03', '2026-10-25', 'short')).toBe('Tuesday, Nov 3')
    expect(dayHeading('2027-01-02', '2026-10-25', 'short')).toBe('Saturday, Jan 2, 2027')
  })
  it('neighbours and section words', () => {
    expect(dayName('2026-10-26', '2026-10-25')).toBe('Tomorrow')
    expect(dayName('2026-10-24', '2026-10-25')).toBe('Yesterday')
    expect(dayName('2026-11-03', '2026-10-25')).toBe('Tue, Nov 3')
    expect(dayWord('2026-10-28', '2026-10-25')).toBe('Wednesday')
    expect(dayWord('2026-11-03', '2026-10-25')).toBe('The day')
  })
  it("the capture bar's <date lands the new task on that day", () => {
    const parsed = parseCommand(`${captureFor('2026-11-03')}Buy flowers`, [], [], { now: new Date(cairo(25, '10:00')), zone: 'cairo' })
    expect(parsed.title).toBe('Buy flowers')
    expect(zoneDateKey(new Date(parsed.dueAt!), CAIRO)).toBe('2026-11-03')
  })
})
