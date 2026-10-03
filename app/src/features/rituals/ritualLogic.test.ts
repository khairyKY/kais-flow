import { describe, expect, it } from 'vitest'
import {
  captureMeta,
  carryMeta,
  carryRows,
  closeDay,
  headerDate,
  pickCandidates,
  planStatus,
  planWorkload,
  resumeMeta,
  searchOpen,
  seedDayName,
  suggestTimes,
  swapIn,
  sweepRows,
  toPlace,
  tomorrowSuggestions,
  withPick,
  type PickIn,
} from './ritualLogic'
import type { Busy } from '../../components/pickerMath'
import type { Task } from '../../lib/types'

// The design's sample day: Sunday 27 Sep 2026, Cairo = UTC+3. Instants are written in UTC from a
// Cairo wall clock, so every assertion holds under any TZ the suite runs in.
const at = (hhmm: string, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm: string, day = 27) => at(hhmm, day).toISOString()
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null,
  top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null,
  reminder_sent: false, completed_at: null, created_at: iso('06:00', 1), updated_at: iso('06:00', 1), ...over,
})
const m = (hhmm: string) => {
  const [h, mm] = hhmm.split(':').map(Number)
  return h * 60 + mm
}
const busy = (from: string, to: string, title = 'Event'): Busy => ({ start: m(from), end: m(to), title })
// 6a: Deep work 09:00–10:30, Lunch with Omar 13:00–14:00.
const DAY = [busy('09:00', '10:30', 'Deep work — forecasting'), busy('13:00', '14:00', 'Lunch with Omar')]
const NOW = m('07:40')

describe('Carry-over', () => {
  const review = task('review', { due_at: iso('09:00', 27 - 64) })
  const untitled = task('untitled', { due_at: iso('09:00', 26) })
  it('lists what is past its date, in the order it came in, with its lateness', () => {
    const rows = carryRows([review, untitled, task('today', { due_at: iso('09:00') })], [], at('07:40'))
    expect(rows.map((r) => r.id)).toEqual(['review', 'untitled'])
    expect(carryMeta(rows[0].due, at('07:40'))).toBe('Overdue 64d')
    expect(carryMeta(rows[1].due, at('07:40'))).toBe('From yesterday')
  })
  it('a decided row stays (its choice moved it off overdue); done and deleted rows leave', () => {
    const moved = { ...untitled, due_at: iso('09:00') }
    const draft = [{ id: 'review', due: review.due_at, choice: 'today' as const }, { id: 'untitled', due: untitled.due_at, choice: 'today' as const }]
    expect(carryRows([{ ...review, due_at: iso('09:00') }, moved], draft, at('07:40')).map((r) => r.id)).toEqual(['review', 'untitled'])
    expect(carryRows([{ ...review, status: 'done' }], draft, at('07:40'))).toEqual([])
    expect(carryRows([moved], draft, at('07:40')).map((r) => r.id)).toEqual(['untitled'])
  })
  it('lateness reads the Cairo calendar: 00:30 Monday is one day after Sunday 09:00', () => {
    expect(carryMeta(iso('09:00'), at('00:30', 28))).toBe('From yesterday')
  })
})

describe('Pick your 3 — rows', () => {
  const seedA = task('audit', { duration_min: 120 })
  const seedB = task('tyre', { duration_min: 30 })
  const starred = task('node', { top3: true })
  const dueToday = task('plants', { due_at: iso('09:00') })
  const later = task('budget', { due_at: iso('09:00', 30) })
  const carried = task('review', { due_at: iso('09:00', 1), top3: true })
  const all = [later, dueToday, starred, seedA, seedB, carried, task('backlog')]
  it('seeds → starred → due today → the week; never a carried row; capped at 4', () => {
    expect(pickCandidates(all, [seedA, seedB], [], new Set(['review']), at('07:40')).map((t) => t.id)).toEqual(['audit', 'tyre', 'node', 'plants'])
  })
  it('every pick stays listed, even past the cap', () => {
    expect(pickCandidates(all, [seedA, seedB], ['audit', 'tyre', 'budget'], new Set(['review']), at('07:40')).map((t) => t.id)).toEqual(['audit', 'tyre', 'node', 'plants', 'budget'])
  })
  it('a 4th star is refused (swap toast); Swap keeps the goal and the second, replaces the last', () => {
    expect(withPick(['a', 'b'], 'c')).toEqual({ picks: ['a', 'b', 'c'], full: false })
    expect(withPick(['a', 'b', 'c'], 'd')).toEqual({ picks: ['a', 'b', 'c'], full: true })
    expect(withPick(['a', 'b', 'c'], 'b').picks).toEqual(['a', 'c'])
    expect(swapIn(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'd'])
  })
})

describe('Suggested times', () => {
  const picks: PickIn[] = [{ id: 'audit', dur: 120 }, { id: 'tyre', dur: 30 }, { id: 'node', dur: 45 }]
  it('6a: each pick in the first free gap that fits, after the one before it', () => {
    const s = suggestTimes(picks, DAY, {}, NOW)
    expect(s.map((x) => [x.id, x.kind, x.start, x.end])).toEqual([
      ['audit', 'suggested', m('10:30'), m('12:30')],
      ['tyre', 'suggested', m('12:30'), m('13:00')],
      ['node', 'suggested', m('14:00'), m('14:45')],
    ])
    expect(s[0].after).toBe('Deep work')
    expect(s[2].after).toBe('Lunch with Omar')
  })
  it('never before now: at 11:05 the first start is 11:15', () => {
    expect(suggestTimes([{ id: 'a', dur: 30 }], DAY, {}, m('11:05'))[0].start).toBe(m('11:15'))
  })
  it('an accepted slot right after an event still says so', () => {
    expect(suggestTimes([{ id: 'a', dur: 30 }], DAY, { a: { at: m('14:00'), dur: 30 } }, NOW)[0]).toMatchObject({ kind: 'accepted', after: 'Lunch with Omar' })
  })
  it('accepted and "No time" hold; the rest fill around the accepted slot', () => {
    const s = suggestTimes(picks, DAY, { tyre: { at: m('10:30'), dur: 30 }, node: { at: null, dur: 45 } }, NOW)
    expect(s.map((x) => [x.id, x.kind, x.start])).toEqual([
      ['audit', 'suggested', m('11:00')],
      ['tyre', 'accepted', m('10:30')],
      ['node', 'untimed', 0],
    ])
  })
  it('a pick already on the calendar keeps its block', () => {
    expect(suggestTimes([{ id: 'a', dur: 90, booked: { start: m('13:30'), end: m('15:00') } }], DAY, {}, NOW)[0]).toMatchObject({ kind: 'booked', start: m('13:30') })
  })
  it('6e: nothing after it → a long pick runs past 18:00 (flagged)', () => {
    const s = suggestTimes([{ id: 'budget', dur: 240 }], [busy('09:00', '14:30')], {}, NOW)
    expect(s[0]).toMatchObject({ kind: 'suggested', start: m('14:30'), end: m('18:30'), late: true })
  })
  it('6j: calendar full 09:00–18:00 → no free slot for any pick', () => {
    expect(suggestTimes(picks, [busy('09:00', '18:00')], {}, NOW).every((x) => x.kind === 'noslot')).toBe(true)
  })
  it('after 18:00 nothing can start today', () => {
    expect(suggestTimes([{ id: 'a', dur: 15 }], [], {}, m('18:10'))[0].kind).toBe('noslot')
  })
})

describe('Workload line', () => {
  const picks: PickIn[] = [{ id: 'audit', dur: 120 }, { id: 'tyre', dur: 30 }]
  it('6a: calendar ahead + picks, finish = the last slot or block, rounded up to 10', () => {
    const w = planWorkload([...DAY, busy('16:00', '17:30')], picks, suggestTimes(picks, DAY, {}, NOW), NOW)
    expect(w).toEqual({ text: "~6h 30m planned · you'll finish around 17:30", over: 0 })
  })
  it('the 18:00 gym is outside the working day: not workload, not the finish', () => {
    const w = planWorkload([...DAY, busy('18:00', '19:00', 'Gym')], picks, suggestTimes(picks, DAY, {}, NOW), NOW)
    expect(w).toEqual({ text: "~5h planned · you'll finish around 14:00", over: 0 })
  })
  it('6e: past 18:00 → "you\'d finish" and the minutes over', () => {
    const p: PickIn[] = [{ id: 'budget', dur: 240 }]
    const b = [busy('09:00', '14:30')]
    expect(planWorkload(b, p, suggestTimes(p, b, {}, NOW), NOW)).toEqual({ text: "~9h 30m planned · you'd finish around 18:30", over: 30 })
  })
  it("6j: nothing fits → meetings and how far over", () => {
    const p: PickIn[] = [...picks, { id: 'node', dur: 45 }]
    const b = [busy('09:00', '18:00')]
    expect(planWorkload(b, p, suggestTimes(p, b, {}, NOW), NOW)).toEqual({ text: "~9h of meetings · the 3 picks don't fit", over: 195 })
  })
  it('6f: an empty day', () => {
    expect(planWorkload([], [], [], NOW).text).toBe('Nothing planned yet · the day is open')
  })
  it('only what is still ahead counts once the day is under way', () => {
    expect(planWorkload(DAY, [], [], m('13:30')).text).toBe("~30m planned · you'll finish around 14:00")
  })
})

describe('Plan footer status + Start the day', () => {
  const carry = [{ id: 'a', due: null, choice: 'today' as const }, { id: 'b', due: null }, { id: 'c', due: null }]
  const picks: PickIn[] = [{ id: 'audit', dur: 120 }, { id: 'tyre', dur: 30 }, { id: 'node', dur: 45 }, { id: 'call', dur: 30, booked: { start: m('16:00'), end: m('16:30') } }]
  // audit suggested, tyre set by you, node "No time", call already on the calendar.
  const slots = suggestTimes(picks, DAY, { tyre: { at: m('15:00'), dur: 30 }, node: { at: null, dur: 45 } }, NOW)
  it('mid-carry-over → "1 of 3 decided"; otherwise picks · timed (suggested counts); none → "0 picked"', () => {
    expect(planStatus(carry, slots)).toBe('1 of 3 decided')
    expect(planStatus(carry.slice(1), slots)).toBe('4 picked · 3 timed')
    expect(planStatus([], suggestTimes(picks.slice(0, 2), DAY, {}, NOW))).toBe('2 picked · 2 timed')
    expect(planStatus([], suggestTimes(picks.slice(0, 2), [busy('09:00', '18:00')], {}, NOW))).toBe('2 picked · 0 timed')
    expect(planStatus([], [])).toBe('0 picked')
  })
  it('Start the day places every timed pick (suggested or set), never "No time" or a booked one', () => {
    expect(toPlace(slots).map((s) => [s.id, s.kind, s.start])).toEqual([
      ['audit', 'suggested', m('10:30')],
      ['tyre', 'accepted', m('15:00')],
    ])
    expect(toPlace(suggestTimes(picks, [busy('09:00', '18:00')], {}, NOW))).toEqual([])
  })
})

describe('Pick your 3 — search all tasks', () => {
  const P = [{ id: 'p-fin', name: 'Finance' }, { id: 'p-flow', name: "Kai's Flow" }]
  const seed = task('seed', { title: 'Finish the flow audit', project_id: 'p-flow' })
  const soon = task('soon', { title: 'Call the tyre supplier', due_at: iso('09:00', 29) })
  const sooner = task('sooner', { title: 'Water the plants', due_at: iso('09:00', 28) })
  const loose = task('loose', { title: 'Renew the car licence' })
  const budget = task('budget', { title: 'Draft the Q4 budget', project_id: 'p-fin' })
  const finance = task('finance', { title: 'Finance call notes' })
  const gone = task('gone', { title: 'Finance old', status: 'done' })
  const trashed = task('trashed', { title: 'Finance trashed', deleted_at: iso('06:00') })
  const all = [loose, budget, soon, seed, sooner, finance, gone, trashed]
  it('empty query: the suggestions first, then every other open task by due date (none last)', () => {
    expect(searchOpen(all, P, [seed], '').map((t) => t.id)).toEqual(['seed', 'sooner', 'soon', 'loose', 'budget', 'finance'])
    expect(searchOpen(all, P, [seed], '  ').map((t) => t.id)).toEqual(['seed', 'sooner', 'soon', 'loose', 'budget', 'finance'])
  })
  it('title matches first, then project-name matches; done and trashed never', () => {
    expect(searchOpen(all, P, [seed], 'FINANCE').map((t) => t.id)).toEqual(['finance', 'budget'])
    expect(searchOpen(all, P, [seed], 'licence').map((t) => t.id)).toEqual(['loose'])
  })
  it('every word must match, in any order; nothing matches → empty', () => {
    expect(searchOpen(all, P, [seed], 'audit flow').map((t) => t.id)).toEqual(['seed'])
    expect(searchOpen(all, P, [seed], "kai's").map((t) => t.id)).toEqual(['seed'])
    expect(searchOpen(all, P, [seed], 'dentist')).toEqual([])
  })
})

describe('Inbox capture meta', () => {
  it('voice last night · typed on Friday', () => {
    expect(captureMeta({ kind: 'voice', created_at: iso('23:10', 26) }, at('07:40'))).toBe('Voice · last night 23:10')
    expect(captureMeta({ kind: 'text', created_at: iso('10:00', 25) }, at('07:40'))).toBe('Typed · Fri')
    expect(captureMeta({ kind: 'text', created_at: iso('07:12') }, at('07:40'))).toBe('Typed · today 07:12')
  })
})

describe('Resume (6m)', () => {
  it('2 of 4 done → ~1 min left · Pick your 3 next', () => {
    expect(resumeMeta('morning', new Set(['overdue', 'inbox']))).toEqual(['~1 min left', 'Pick your 3 next'])
    expect(resumeMeta('evening', new Set(['sweep']))).toEqual(['~1 min left', 'One line next'])
  })
})

describe('Shut down — Sweep', () => {
  const milk = task('milk', { due_at: iso('09:00') })
  const review = task('review', { top3: true, due_at: iso('09:00', 1) })
  const later = task('later', { due_at: iso('09:00', 29) })
  it("today's plate, in the order first seen; touched rows stay after they leave it", () => {
    const first = sweepRows([milk, review, later], [], new Set(), at('21:40'))
    expect(first.rows.map((t) => t.id)).toEqual(['milk', 'review'])
    const rolled = { ...review, due_at: iso('09:00', 28) }
    const done = { ...milk, status: 'done' as const, completed_at: iso('21:41') }
    expect(sweepRows([done, rolled, later], first.seen, new Set(['review', 'milk']), at('21:42')).rows.map((t) => t.id)).toEqual(['milk', 'review'])
    // Untouched, only what is still today's plate — a starred row always is (Today's own rule).
    expect(sweepRows([done, rolled, later], first.seen, new Set(), at('21:42')).rows.map((t) => t.id)).toEqual(['review'])
  })
})

describe("Shut down — Tomorrow's 3", () => {
  const tyre = task('tyre', { due_at: iso('09:00', 28) })
  const review = task('review', { top3: true })
  const node = task('node', { top3: true })
  const milk = task('milk')
  const omar = task('omar', { top3: true, due_at: iso('09:00', 30) })
  const plants = task('plants', { due_at: iso('09:00', 29) })
  it('due tomorrow → leftovers (Top 3 first) → due this week', () => {
    const s = tomorrowSuggestions([plants, omar, milk, node, review, tyre], [milk, review, node], at('21:40'))
    expect(s.map((x) => [x.task.id, x.why])).toEqual([
      ['tyre', 'Due tomorrow'],
      ['review', 'Left today'],
      ['node', 'Left today'],
      ['milk', 'Left today'],
      ['plants', 'Due Tue'],
    ])
    expect(tomorrowSuggestions([plants], [], at('21:40'))).toEqual([{ task: plants, why: 'Due Tue' }])
  })
  it('a rolled leftover still reads "Left today", not "Due tomorrow"', () => {
    const rolled = { ...milk, due_at: iso('09:00', 28) }
    expect(tomorrowSuggestions([rolled], [rolled], at('21:40'))[0].why).toBe('Left today')
  })
  it('Close the day: seed new stars, take back unstarred seeds, roll starred open sweep rows', () => {
    expect(closeDay(['tyre', 'review', 'node'], ['tyre', 'milk'], new Set(['review', 'milk']))).toEqual({ seed: ['review', 'node'], unseed: ['milk'], roll: ['review'] })
  })
  it('the seeds are for the next loop day: 00:30 Monday still plants for Monday', () => {
    expect(seedDayName(at('21:40'))).toBe('Monday')
    expect(seedDayName(at('00:30', 28), 'short')).toBe('Mon')
  })
})

describe('headerDate', () => {
  it('reads Cairo: Sun 27 Sep, even at 23:30 Cairo (20:30 UTC)', () => {
    expect(headerDate(at('23:30'))).toBe('Sun 27 Sep')
  })
})
