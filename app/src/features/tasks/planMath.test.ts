import { describe, expect, it } from 'vitest'
import { isOverdue, planGlossary, planOptions, slotText, spreadPlan, todayFor } from './planMath'
import { scheduleNextWeek, scheduleToday, scheduleTomorrow } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'

// Cairo is UTC+3 until 30 Oct 2026. The app's zone, not the device's (the ×4 TZ run proves it).
const at = (s: string) => new Date(`${s}+03:00`)
const WED = at('2026-10-07T10:00:00')
const SAT_SUN = [0, 6]
const FRI_SAT = [5, 6]
const task = (over: Partial<Task> = {}) => ({ id: 't', title: 'Call the bank', status: 'todo', due_at: null, scheduled_start: null, someday: false, ...over }) as Task
const keys = (o: { key: string }[]) => o.map((x) => x.key)

describe('planOptions — one Plan list, each option saying where it lands', () => {
  it('in order, with the resolved day and time and a plain line each', () => {
    const o = planOptions(WED, { task: task(), weekend: SAT_SUN, slot: { day: '2026-10-07', start: 14 * 60 + 30 }, dur: 30, someday: true })
    expect(o.map((x) => [x.label, x.hint])).toEqual([
      ['Today', 'Wed 7 · 09:00'],
      ['Next free slot', 'Today 14:30–15:00'],
      ['Tomorrow, first thing', 'Thu 8 · 09:00'],
      ['This weekend', 'Sat 10 · 09:00'],
      ['Next week', 'Mon 12 · 09:00'],
      ['Pick date & time…', ''],
      ['Someday', ''],
    ])
    expect(o.find((x) => x.key === 'slot')!.means).toMatch(/^ASAP: /)
    expect(o.find((x) => x.key === 'tomorrow')!.means).toBe('the start of your day')
    expect(o.find((x) => x.key === 'weekend')!.means).toBe('the first day of your weekend (Sat + Sun)')
    expect(o.find((x) => x.key === 'today')!.iso).toBe(scheduleToday(WED))
    expect(o.find((x) => x.key === 'tomorrow')!.iso).toBe(scheduleTomorrow(WED))
    expect(o.find((x) => x.key === 'nextweek')!.iso).toBe(scheduleNextWeek(WED))
  })

  it('This weekend follows the user’s weekend: Fri + Sat lands on Friday', () => {
    const o = planOptions(WED, { task: task(), weekend: FRI_SAT })
    expect(o.find((x) => x.key === 'weekend')).toMatchObject({ hint: 'Fri 9 · 09:00', means: 'the first day of your weekend (Fri + Sat)' })
  })

  it('never two on one day (quickPicks’ rule): the weekend drops when it is today or tomorrow', () => {
    // Fri + Sat, on a Thursday: the weekend is tomorrow → only Tomorrow.
    expect(keys(planOptions(at('2026-10-08T10:00:00'), { weekend: FRI_SAT }))).toEqual(['today', 'tomorrow', 'nextweek', 'pick'])
    // …on a Friday: it is today.
    expect(keys(planOptions(at('2026-10-09T10:00:00'), { weekend: FRI_SAT }))).toEqual(['today', 'tomorrow', 'nextweek', 'pick'])
    // …on a Saturday (inside the weekend): the next Friday.
    expect(planOptions(at('2026-10-10T10:00:00'), { weekend: FRI_SAT }).find((x) => x.key === 'weekend')?.hint).toBe('Fri 16 · 09:00')
    // Sun only, on a Sunday: Today covers it; Next week skips tomorrow's Monday.
    const sun = planOptions(at('2026-10-11T10:00:00'), { weekend: [0] })
    expect(keys(sun)).toEqual(['today', 'tomorrow', 'nextweek', 'pick'])
    expect(sun.find((x) => x.key === 'nextweek')?.hint).toBe('Mon 19 · 09:00')
    // …and on the Monday after, the coming Sunday.
    expect(planOptions(at('2026-10-12T10:00:00'), { weekend: [0] }).find((x) => x.key === 'weekend')?.hint).toBe('Sun 18 · 09:00')
    // No weekend at all: no This weekend.
    expect(keys(planOptions(WED, { weekend: [] }))).not.toContain('weekend')
    // Every pick lands on its own day.
    for (const w of [SAT_SUN, FRI_SAT, [0], [1, 4]]) {
      for (let d = 0; d < 7; d++) {
        const days = planOptions(new Date(WED.getTime() + d * 86_400_000), { weekend: w }).filter((x) => x.iso).map((x) => x.hint.split(' · ')[0])
        expect(new Set(days).size).toBe(days.length)
      }
    }
  })

  it('Today keeps the task’s own time; with none (or the 09:00 default) it is 09:00', () => {
    const late = task({ due_at: at('2026-10-05T15:30:00').toISOString() })
    expect(todayFor(late, WED)).toBe(at('2026-10-07T15:30:00').toISOString())
    expect(planOptions(WED, { task: late, weekend: SAT_SUN })[0]).toMatchObject({ hint: 'Wed 7 · 15:30', means: 'today, keeps its 15:30' })
    expect(todayFor(task(), WED)).toBe(scheduleToday(WED))
    expect(planOptions(WED, { task: task({ due_at: at('2026-10-05T09:00:00').toISOString() }), weekend: SAT_SUN })[0].means).toBe('today, no set time')
  })

  it('a selection: no free-slot finder, Today at 09:00', () => {
    const o = planOptions(WED, { weekend: SAT_SUN })
    expect(keys(o)).not.toContain('slot')
    expect(o[0].hint).toBe('Wed 7 · 09:00')
  })

  it('no free gap: the finder still shows, saying so', () => {
    expect(planOptions(WED, { task: task(), weekend: SAT_SUN, slot: null }).find((x) => x.key === 'slot')?.hint).toBe('None free')
  })

  it('ticks the day the task already sits on; No date only where offered', () => {
    const o = planOptions(WED, { task: task({ due_at: at('2026-10-08T09:00:00').toISOString() }), weekend: SAT_SUN, clear: true })
    expect(o.filter((x) => x.current).map((x) => x.key)).toEqual(['tomorrow'])
    expect(o.at(-1)).toMatchObject({ key: 'none', label: 'No date' })
  })
})

describe('spreadPlan — Replan all → Spread into free slots', () => {
  const ev = (id: string, from: string, to: string, task_id: string | null = null) =>
    ({ id, title: id, starts_at: at(`2026-10-07T${from}:00`).toISOString(), ends_at: at(`2026-10-07T${to}:00`).toISOString(), all_day: false, busy: true, task_id, deleted_at: null }) as unknown as CalendarEvent
  const events = [ev('Lunch', '12:00', '13:00'), ev('Review', '15:00', '20:00')]
  it('in order, each in the first free gap that fits its own length; the rest to tomorrow', () => {
    const tasks = [task({ id: 'a', duration_min: 60 }), task({ id: 'b', duration_min: 90 }), task({ id: 'c' }), task({ id: 'd', duration_min: 120 }), task({ id: 'e', duration_min: 30 })]
    const p = spreadPlan(tasks, events, WED) // 10:00: free 10:00–12:00, 13:00–15:00
    expect(p.map((x) => [x.task.id, x.slot?.start ?? null, x.dur])).toEqual([
      ['a', 600, 60], // 10:00–11:00
      ['b', 780, 90], // 13:00–14:30 (11:00–12:00 is too short)
      ['c', 660, 30], // 11:00–11:30: the earliest gap that fits it, though after b in the list
      ['d', null, 120], // nothing left that long → tomorrow
      ['e', 690, 30], // 11:30–12:00
    ])
    expect(p.every((x) => !x.slot || x.slot.day === '2026-10-07')).toBe(true)
  })
  it('the tasks’ own (stuck) blocks don’t count as busy; a full day sends them all to tomorrow', () => {
    expect(spreadPlan([task({ id: 'a' })], [ev('mine', '10:00', '20:00', 'a')], WED)[0].slot?.start).toBe(600)
    expect(spreadPlan([task({ id: 'a' })], [ev('wall', '08:00', '20:00')], WED)[0].slot).toBeNull()
  })
  it('the Plan list says how it would split', () => {
    expect(planOptions(WED, { weekend: SAT_SUN, spread: { today: 3, tomorrow: 317 } }).find((x) => x.key === 'spread')).toMatchObject({ label: 'Spread into free slots', hint: '3 today · 317 tomorrow' })
  })
})

describe('slotText', () => {
  it('Today / Tomorrow / the day, with the range', () => {
    expect(slotText({ day: '2026-10-07', start: 870 }, 30, WED)).toBe('Today 14:30–15:00')
    expect(slotText({ day: '2026-10-08', start: 540 }, 45, WED)).toBe('Tomorrow 09:00–09:45')
    expect(slotText({ day: '2026-10-09', start: 660 }, 60, WED)).toBe('Fri 9 11:00–12:00')
  })
})

describe('isOverdue — Plan… reads Replan…', () => {
  it('strictly before today, by day', () => {
    expect(isOverdue(task({ due_at: at('2026-10-06T23:00:00').toISOString() }), WED)).toBe(true)
    expect(isOverdue(task({ due_at: at('2026-10-07T08:00:00').toISOString() }), WED)).toBe(false)
    expect(isOverdue(task({ scheduled_start: at('2026-10-05T10:00:00').toISOString() }), WED)).toBe(true)
    expect(isOverdue(task(), WED)).toBe(false)
  })
})

describe('planGlossary — Settings → Calendar', () => {
  it('explains every option, in the Plan menu’s words', () => {
    const g = planGlossary(FRI_SAT)
    expect(g.map((x) => x.label)).toEqual(['Today', 'Next free slot', 'Tomorrow, first thing', 'This weekend', 'Next week', 'Pick date & time…', 'Replan'])
    expect(g[1].means).toMatch(/^ASAP/)
    expect(g[3].means).toMatch(/Fri \+ Sat/)
    expect(planGlossary([])[3].means).toMatch(/no weekend/)
  })
})
