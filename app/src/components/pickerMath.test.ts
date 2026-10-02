import { describe, expect, it } from 'vitest'
import { scheduleNextWeek, scheduleToday, scheduleTomorrow } from '../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../lib/types'
import {
  QUARTERS,
  addDays,
  atDay,
  busyAt,
  busyOnDay,
  dayHint,
  dayLabel,
  dayTitle,
  daysWithItems,
  durationLabel,
  freeSlots,
  monthGrid,
  quickPicks,
  shiftDay,
  shiftMonth,
} from './pickerMath'

// Every `now` is an explicit instant and every expectation a Cairo day key or a UTC ISO, so these
// hold under any device zone (the gate runs them under UTC, Cairo, Los Angeles and Tokyo).
// Cairo 2026: UTC+2 in winter, UTC+3 from Fri Apr 24 00:00, back to UTC+2 after Thu Oct 29 24:00.

const ev = (title: string, starts_at: string, ends_at: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: title, title, starts_at, ends_at, all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, created_at: '', updated_at: '', ...over,
})
const task = (over: Partial<Task>): Task => ({
  id: 't', project_id: null, domain_id: null, area_id: null, title: 't', notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, created_at: '', updated_at: '', ...over,
})

describe('monthGrid — Monday first, blanks before the 1st, next month fills the last week', () => {
  it('September 2026 (the MK drawing): starts Tuesday, ends on Sun 4 Oct', () => {
    const g = monthGrid({ y: 2026, m: 9 })
    expect(g).toHaveLength(5)
    expect(g[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(g[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })
  it('a month starting on Monday has no blanks (June 2026)', () => {
    const g = monthGrid({ y: 2026, m: 6 })
    expect(g[0][0]).toBe('2026-06-01')
    expect(g.at(-1)!.at(-1)).toBe('2026-07-05')
  })
  it('a month starting on Sunday has six blanks (Feb 2026)', () => {
    const g = monthGrid({ y: 2026, m: 2 })
    expect(g[0]).toEqual([null, null, null, null, null, null, '2026-02-01'])
  })
  it('six rows when the month needs them (Aug 2026), four when it fits (Feb 2027)', () => {
    expect(monthGrid({ y: 2026, m: 8 })).toHaveLength(6)
    expect(monthGrid({ y: 2027, m: 2 })).toHaveLength(4)
  })
  it('crosses the year edge (Dec 2026 → Jan 2027) and knows leap years', () => {
    expect(monthGrid({ y: 2026, m: 12 }).at(-1)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(monthGrid({ y: 2028, m: 2 }).flat().filter((k) => k?.startsWith('2028-02'))).toHaveLength(29)
  })
  it('every week is 7 cells', () => {
    for (let m = 1; m <= 12; m++) for (const w of monthGrid({ y: 2026, m })) expect(w).toHaveLength(7)
  })
})

describe('day math', () => {
  it('addDays crosses month, year and the DST switch days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-04-23', 1)).toBe('2026-04-24')
    expect(addDays('2026-10-29', 1)).toBe('2026-10-30')
  })
  it('shiftMonth wraps years; shiftDay clamps to the month length', () => {
    expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 })
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 })
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-28')
    expect(shiftDay('2028-01-31', 1)).toBe('2028-02-29')
    expect(shiftDay('2026-03-31', -1)).toBe('2026-02-28')
  })
  it('labels', () => {
    expect(dayHint('2026-09-27', '2026-09-27')).toBe('Sun 27')
    expect(dayHint('2026-10-03', '2026-09-27')).toBe('Sat 3 Oct')
    expect(dayTitle('2026-09-28', '2026-09-27')).toBe('Tomorrow · Mon 28 Sep')
    expect(dayTitle('2026-09-30', '2026-09-27')).toBe('Wed 30 Sep')
    expect(dayLabel('2026-09-28')).toBe('Monday 28 September 2026')
  })
})

describe('atDay — a picked day at 09:00 Cairo unless a time is set', () => {
  it('summer and winter offsets from the tz database', () => {
    expect(atDay('2026-04-24')).toBe('2026-04-24T06:00:00.000Z') // first summer day
    expect(atDay('2026-01-15')).toBe('2026-01-15T07:00:00.000Z')
    expect(atDay('2026-10-30', '23:30')).toBe('2026-10-30T21:30:00.000Z') // first winter day
    expect(atDay('2026-09-28', '14:45')).toBe('2026-09-28T11:45:00.000Z')
  })
})

describe('quickPicks', () => {
  const sunday = new Date('2026-09-27T10:00:00+03:00')
  it('the MK drawing: Today Sun 27 · Tomorrow Mon 28 · 09:00 · This weekend Sat 3 Oct', () => {
    const q = quickPicks(sunday, true)
    expect(q.map((p) => [p.label, p.hint])).toEqual([
      ['Today', 'Sun 27'],
      ['Tomorrow', 'Mon 28 · 09:00'],
      ['This weekend', 'Sat 3 Oct'],
      // Kai 2026-10-03: as drawn — on a Sunday, Next week skips tomorrow's Monday.
      ['Next week', 'Mon 5 Oct'],
    ])
    expect(q.map((p) => p.day)).toEqual(['2026-09-27', '2026-09-28', '2026-10-03', '2026-10-05'])
    expect(quickPicks(new Date('2026-09-30T10:00:00+03:00'), false)[3].hint).toBe('Mon 5 Oct')
  })
  it('Today, Tomorrow and Next week are the app-wide shortcuts, never now+24h', () => {
    const q = quickPicks(sunday, true)
    expect(q[0].iso).toBe(scheduleToday(sunday))
    expect(q[1].iso).toBe(scheduleTomorrow(sunday))
    expect(q[1].iso).toBe('2026-09-28T06:00:00.000Z')
    expect(q[3].iso).toBe(scheduleNextWeek(sunday))
    expect(q[2].iso).toBe('2026-10-03T06:00:00.000Z')
  })
  it('a date-only caller gets no time in the Tomorrow hint', () => {
    expect(quickPicks(sunday, false)[1].hint).toBe('Mon 28')
  })
  it('uses the Cairo day, not the device day (01:30 Cairo = 22:30Z the day before)', () => {
    expect(quickPicks(new Date('2026-09-26T22:30:00Z'), false)[0].day).toBe('2026-09-27')
  })
  it('on a Saturday, this weekend is today', () => {
    expect(quickPicks(new Date('2026-10-03T12:00:00+03:00'), false)[2].day).toBe('2026-10-03')
  })
  it('across the October switch back to winter time', () => {
    const q = quickPicks(new Date('2026-10-28T12:00:00+03:00'), true)
    expect(q[1].iso).toBe('2026-10-29T06:00:00.000Z') // Thu, still summer
    expect(q[2].iso).toBe('2026-10-31T07:00:00.000Z') // Sat, winter
    expect(q[3].iso).toBe('2026-11-02T07:00:00.000Z')
  })
})

describe('daysWithItems — the grid dots', () => {
  it('open tasks by due or scheduled day, live events by start; done/deleted ignored', () => {
    const days = daysWithItems(
      [
        task({ due_at: '2026-09-28T06:00:00Z' }),
        task({ scheduled_start: '2026-09-29T21:30:00Z' }), // 00:30 Cairo on the 30th
        task({ due_at: '2026-10-01T06:00:00Z', status: 'done' }),
        task({ due_at: '2026-10-02T06:00:00Z', deleted_at: '2026-09-01T00:00:00Z' }),
      ],
      [ev('a', '2026-10-05T07:00:00Z', '2026-10-05T08:00:00Z'), ev('b', '2026-10-06T07:00:00Z', '2026-10-06T08:00:00Z', { deleted_at: 'x' })],
    )
    expect([...days].sort()).toEqual(['2026-09-28', '2026-09-30', '2026-10-05'])
  })
})

describe('time rows, busy blocks and free slots', () => {
  const day = '2026-09-28' // UTC+3
  const at = (hhmm: string) => atDay(day, hhmm)
  const events = [
    ev('Gym', at('08:00'), at('09:00')),
    ev('Standup', at('09:30'), at('09:45')),
    ev('Deep work', at('09:45'), at('11:00')),
    ev('Lunch', at('12:00'), at('14:30')),
    ev('Review', at('16:00'), at('20:00')),
    ev('Holiday', at('00:00'), at('23:59'), { all_day: true }),
    ev('Tentative', at('10:00'), at('18:00'), { busy: false }),
  ]
  const busy = busyOnDay(events, day)
  const sunday = new Date('2026-09-27T10:00:00+03:00')

  it('96 quarter rows, 00:00 → 23:45', () => {
    expect(QUARTERS).toHaveLength(96)
    expect([QUARTERS[0], QUARTERS[36], QUARTERS[95]]).toEqual(['00:00', '09:00', '23:45'])
  })
  it('busy blocks in Cairo minutes; all-day and free events are not busy', () => {
    expect(busy.map((b) => [b.title, b.start, b.end])).toEqual([
      ['Gym', 480, 540],
      ['Standup', 570, 585],
      ['Deep work', 585, 660],
      ['Lunch', 720, 870],
      ['Review', 960, 1200],
    ])
    expect(busyAt(busy, 570)?.title).toBe('Standup')
    expect(busyAt(busy, 555)).toBeUndefined()
    expect(busyAt(busy, 540)).toBeUndefined()
  })
  it('an event over midnight is clipped to each day; one ending at 00:00 is not on the next day', () => {
    const late = [ev('Late', atDay('2026-09-27', '23:00'), at('01:00')), ev('Ends at midnight', atDay('2026-09-27', '22:00'), at('00:00'))]
    expect(busyOnDay(late, '2026-09-27').map((b) => [b.start, b.end])).toEqual([[1320, 1440], [1380, 1440]])
    expect(busyOnDay(late, day).map((b) => [b.title, b.start, b.end])).toEqual([['Late', 0, 60]])
  })
  it('on the October fall-back day the wall clock still reads right', () => {
    // 19:00Z = 22:00 (+3); 21:30Z = 23:30 (+2, after the 24:00 → 23:00 switch)
    expect(busyOnDay([ev('Film', '2026-10-29T19:00:00Z', '2026-10-29T21:30:00Z')], '2026-10-29').map((b) => [b.start, b.end])).toEqual([[1320, 1410]])
  })
  it('the MK drawing: free 09:00–09:30, 11:00–12:00, 14:30–16:00', () => {
    expect(freeSlots(busy, day, sunday)).toEqual([{ start: 540, end: 570 }, { start: 660, end: 720 }, { start: 870, end: 960 }])
  })
  it('a longer duration skips the short gaps', () => {
    expect(freeSlots(busy, day, sunday, 60)).toEqual([{ start: 660, end: 720 }, { start: 870, end: 960 }])
  })
  it('today starts at the next quarter; an empty day is 08:00–20:00; a past day has none', () => {
    expect(freeSlots([], day, new Date('2026-09-28T10:07:00+03:00'))).toEqual([{ start: 615, end: 1200 }])
    expect(freeSlots([], day, sunday)).toEqual([{ start: 480, end: 1200 }])
    expect(freeSlots([], '2026-09-26', sunday)).toEqual([])
  })
  it('slots sit on the quarter grid when a block does not (09:44–10:44)', () => {
    const odd = busyOnDay([ev('Gym', at('09:44'), at('10:44'))], day)
    expect(freeSlots(odd, day, sunday)).toEqual([{ start: 480, end: 570 }, { start: 645, end: 1200 }])
  })
  it('at most `limit` slots', () => {
    const many = [0, 1, 2, 3, 4, 5].map((i) => ev(`b${i}`, at(`${String(9 + i * 2).padStart(2, '0')}:00`), at(`${String(10 + i * 2).padStart(2, '0')}:00`)))
    expect(freeSlots(busyOnDay(many, day), day, sunday, 30, 3)).toHaveLength(3)
  })
  it('duration chip labels', () => {
    expect([15, 30, 45, 60, 90, 120].map(durationLabel)).toEqual(['15m', '30m', '45m', '1h', '1h30', '2h'])
  })
})
