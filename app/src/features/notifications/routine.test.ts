import { describe, expect, it } from 'vitest'
import { routineDueOn, routinesDueAt, type ReminderRoutine } from '../../../../supabase/functions/notify/routine.ts'

// Routine reminders (0062): notify's 5-minute sweep and the shells' local plan both ask these.
// Saturday 3 Oct 2026; Cairo = UTC+3, Tokyo = UTC+9.
const cairo = (hhmm: string, day = 3) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const EVERY_DAY = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const r = (over: Partial<ReminderRoutine> = {}): ReminderRoutine => ({ id: 'r1', name: 'Stretch', clock_time: '07:30', cadence: EVERY_DAY, active: true, ...over })

describe('routineDueOn — the cadence and the check-off', () => {
  it('on the days its cadence has (0 = Sunday), with a time, while active', () => {
    expect(routineDueOn(r(), '2026-10-03', [])).toBe(true)
    expect(routineDueOn(r({ cadence: { weekdays: [1, 2, 3, 4, 5] } }), '2026-10-03', [])).toBe(false) // a Saturday
    expect(routineDueOn(r({ cadence: { weekdays: [6] } }), '2026-10-03', [])).toBe(true)
    expect(routineDueOn(r({ clock_time: null }), '2026-10-03', [])).toBe(false)
    expect(routineDueOn(r({ active: false }), '2026-10-03', [])).toBe(false)
    expect(routineDueOn(r({ cadence: null }), '2026-10-03', [])).toBe(false)
  })

  it('not once it is checked off that day', () => {
    expect(routineDueOn(r(), '2026-10-03', [{ routine_id: 'r1', completed_on: '2026-10-03' }])).toBe(false)
    expect(routineDueOn(r(), '2026-10-03', [{ routine_id: 'r1', completed_on: '2026-10-02' }, { routine_id: 'r2', completed_on: '2026-10-03' }])).toBe(true)
  })
})

describe('routinesDueAt — the 5-minute tick', () => {
  it('sends on the first tick at or after the time, exactly once', () => {
    const due = (at: Date) => routinesDueAt([r()], [], at, 'Africa/Cairo').map((x) => x.id)
    expect(due(cairo('07:25'))).toEqual([])
    expect(due(cairo('07:30'))).toEqual(['r1'])
    expect(due(cairo('07:34'))).toEqual(['r1']) // a late tick still catches it
    expect(due(cairo('07:35'))).toEqual([])
  })

  it("reads Postgres's HH:MM:SS, and the user's own clock", () => {
    expect(routinesDueAt([r({ clock_time: '07:30:00' })], [], cairo('07:30'), 'Africa/Cairo')).toHaveLength(1)
    // 07:30 in Tokyo is 01:30 in Cairo.
    expect(routinesDueAt([r()], [], cairo('01:30'), 'Asia/Tokyo')).toHaveLength(1)
    expect(routinesDueAt([r()], [], cairo('07:30'), 'Asia/Tokyo')).toHaveLength(0)
  })

  it('skips a routine already checked off today, and one resting today', () => {
    const done = [{ routine_id: 'r1', completed_on: '2026-10-03' }]
    expect(routinesDueAt([r()], done, cairo('07:30'), 'Africa/Cairo')).toEqual([])
    expect(routinesDueAt([r({ cadence: { weekdays: [0] } })], [], cairo('07:30'), 'Africa/Cairo')).toEqual([])
  })

  it('a 23:58 reminder on the 00:00 tick is judged on the day it belongs to', () => {
    const late = r({ clock_time: '23:58', cadence: { weekdays: [6] } }) // Saturdays only
    expect(routinesDueAt([late], [], cairo('00:00', 4), 'Africa/Cairo')).toHaveLength(1) // Sunday 00:00 → Saturday's
    expect(routinesDueAt([late], [{ routine_id: 'r1', completed_on: '2026-10-03' }], cairo('00:00', 4), 'Africa/Cairo')).toHaveLength(0)
  })

  it('several on one tick come earliest first', () => {
    const two = [r({ id: 'b', clock_time: '07:33' }), r({ id: 'a', clock_time: '07:31' })]
    expect(routinesDueAt(two, [], cairo('07:34'), 'Africa/Cairo').map((x) => x.id)).toEqual(['a', 'b'])
  })
})
