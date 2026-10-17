import { describe, expect, it } from 'vitest'
import { describeFilter, readFilter, smartFilter, smartMatch, type SmartContext, type SmartFilter, type SmartTask } from '../../../../supabase/functions/_shared/smartList.ts'

// The smart list rules (supabase/functions/_shared/smartList.ts), shared with the MCP. Days are the
// zone's, never the machine's: CI runs this file under four TZs and every answer stays the same.
// NOW = 2026-10-15T21:30Z — Fri 16 Oct 00:30 in Cairo, still Thu 15 Oct 21:30 in UTC.
const NOW = new Date('2026-10-15T21:30:00Z')
const CAIRO = { now: NOW, zone: 'Africa/Cairo' }
const at = (iso: string) => `${iso}:00.000Z`

let n = 0
const task = (over: Partial<SmartTask> = {}): SmartTask & { id: string } => ({
  id: `t${++n}`, title: 'A task', notes: null, status: 'todo', due_at: null, scheduled_start: null, someday: false, paused: false,
  project_id: null, area_id: null, domain_id: null, labels: [], priority: null, duration_min: null, ...over,
})
const ids = (tasks: (SmartTask & { id: string })[], f: SmartFilter, ctx: SmartContext = CAIRO) => smartFilter(tasks, f, ctx).map((t) => t.id)

describe('readFilter — the one schema', () => {
  it('keeps what is well-formed and drops the rest, never throws', () => {
    expect(readFilter(null)).toEqual({})
    expect(readFilter('nope')).toEqual({})
    expect(readFilter([1, 2])).toEqual({})
    expect(readFilter({
      places: ['p1', 7, '', 'p1'], labels: [' Urgent ', null], priority: 4, when: ['today', 'tomorrow'], length: 45,
      planned: 'yes', text: '  call  ', show_done: 'true', extra: 1,
    })).toEqual({ places: ['p1'], labels: ['Urgent'], when: ['today'], text: 'call' })
    expect(readFilter({ priority: 2, length: 'none', planned: false, show_done: true, when: [] })).toEqual({ priority: 2, length: 'none', planned: false, show_done: true })
  })
})

describe('smartMatch — each condition', () => {
  it('no conditions: every open, unparked task; never done, cancelled, paused, in Trash or Someday', () => {
    const open = task()
    const all = [open, task({ status: 'done' }), task({ status: 'cancelled' }), task({ paused: true }), task({ deleted_at: at('2026-10-10T08:00') }), task({ someday: true })]
    expect(ids(all, {})).toEqual([open.id])
  })

  it('show done adds finished tasks (never cancelled ones)', () => {
    const open = task()
    const done = task({ status: 'done' })
    expect(ids([open, done, task({ status: 'cancelled' })], { show_done: true })).toEqual([open.id, done.id])
  })

  it('where: a project, an area, or a domain — the task’s own or its container’s', () => {
    const inProject = task({ project_id: 'P' })
    const inArea = task({ area_id: 'A' })
    const inDomain = task({ domain_id: 'D' })
    const viaProject = task({ project_id: 'P2' })
    const elsewhere = task({ project_id: 'X' })
    const all = [inProject, inArea, inDomain, viaProject, elsewhere]
    expect(ids(all, { places: ['P', 'A'] })).toEqual([inProject.id, inArea.id])
    expect(ids(all, { places: ['D'] })).toEqual([inDomain.id])
    const domainOf = (t: SmartTask) => t.domain_id ?? (t.project_id === 'P2' ? 'D' : null)
    expect(ids(all, { places: ['D'] }, { ...CAIRO, domainOf })).toEqual([inDomain.id, viaProject.id])
  })

  it('labels: any of them', () => {
    const a = task({ labels: ['Urgent', 'Calls'] })
    const b = task({ labels: ['Errand'] })
    expect(ids([a, b, task()], { labels: ['Errand', 'Calls'] })).toEqual([a.id, b.id])
  })

  it('priority: at least the pick (1 = !!!)', () => {
    const p1 = task({ priority: 1 })
    const p2 = task({ priority: 2 })
    const p3 = task({ priority: 3 })
    const all = [p1, p2, p3, task({ priority: null })]
    expect(ids(all, { priority: 3 })).toEqual([p1.id, p2.id, p3.id])
    expect(ids(all, { priority: 2 })).toEqual([p1.id, p2.id])
    expect(ids(all, { priority: 1 })).toEqual([p1.id])
  })

  it('length: up to N minutes, or none set', () => {
    const short = task({ duration_min: 15 })
    const half = task({ duration_min: 30 })
    const long = task({ duration_min: 90 })
    const none = task({ duration_min: null })
    const all = [short, half, long, none]
    expect(ids(all, { length: 15 })).toEqual([short.id])
    expect(ids(all, { length: 30 })).toEqual([short.id, half.id])
    expect(ids(all, { length: 60 })).toEqual([short.id, half.id])
    expect(ids(all, { length: 'none' })).toEqual([none.id])
  })

  it('on the calendar: a block or not', () => {
    const planned = task({ scheduled_start: at('2026-10-16T07:00') })
    const dated = task({ due_at: at('2026-10-16T06:00') })
    expect(ids([planned, dated], { planned: true })).toEqual([planned.id])
    expect(ids([planned, dated], { planned: false })).toEqual([dated.id])
  })

  it('text: in the title or notes, any case', () => {
    const t = task({ title: 'Call the Tyre supplier' })
    const nb = task({ title: 'Errand', notes: 'ask about tyres' })
    expect(ids([t, nb, task()], { text: 'TYRE' })).toEqual([t.id, nb.id])
  })
})

describe('smartMatch — when, on the user’s clock', () => {
  // Cairo: today is Fri 16 Oct; the week is Mon 12 – Sun 18.
  const lateThu = task({ due_at: at('2026-10-15T20:00') }) // Thu 23:00 Cairo · Thu 20:00 UTC
  const friMorning = task({ due_at: at('2026-10-16T06:00') }) // Fri 09:00 Cairo
  const blockToday = task({ due_at: at('2026-10-20T06:00'), scheduled_start: at('2026-10-16T08:00') })
  const monThisWeek = task({ due_at: at('2026-10-12T06:00') })
  const sunThisWeek = task({ due_at: at('2026-10-18T09:00') })
  const monNextWeek = task({ due_at: at('2026-10-19T06:00') })
  const in8days = task({ due_at: at('2026-10-24T06:00') })
  const undated = task()
  const parked = task({ someday: true })
  const all = [lateThu, friMorning, blockToday, monThisWeek, sunThisWeek, monNextWeek, in8days, undated, parked]

  it('overdue · today · this week · next 7 days · no date · someday', () => {
    expect(ids(all, { when: ['overdue'] })).toEqual([lateThu.id, monThisWeek.id])
    expect(ids(all, { when: ['today'] })).toEqual([friMorning.id, blockToday.id])
    expect(ids(all, { when: ['week'] })).toEqual([lateThu.id, friMorning.id, monThisWeek.id, sunThisWeek.id])
    expect(ids(all, { when: ['next7'] })).toEqual([friMorning.id, blockToday.id, sunThisWeek.id, monNextWeek.id])
    expect(ids(all, { when: ['none'] })).toEqual([undated.id])
    expect(ids(all, { when: ['someday'] })).toEqual([parked.id])
  })

  it('the same tasks in UTC, where it is still Thursday', () => {
    const utc = { now: NOW, zone: 'UTC' }
    expect(ids(all, { when: ['today'] }, utc)).toEqual([lateThu.id])
    expect(ids(all, { when: ['overdue'] }, utc)).toEqual([monThisWeek.id])
  })

  it('a Sunday belongs to the week that started the Monday before', () => {
    // Sun 18 Oct 03:00 in LA: 06:00 UTC on a Monday is still the Sunday before there — the 12th's
    // task falls in last week, the 19th's in this one.
    const sunday = { now: new Date('2026-10-18T10:00:00Z'), zone: 'America/Los_Angeles' }
    expect(ids(all, { when: ['week'] }, sunday)).toEqual([lateThu.id, friMorning.id, sunThisWeek.id, monNextWeek.id])
    const monday = { now: new Date('2026-10-18T16:00:00Z'), zone: 'Asia/Tokyo' } // Mon 19 Oct 01:00 Tokyo
    expect(ids(all, { when: ['week'] }, monday)).toEqual([blockToday.id, monNextWeek.id, in8days.id])
  })
})

describe('smartMatch — combinations', () => {
  it('groups AND together; picks inside a group OR', () => {
    const fit = task({ project_id: 'W', duration_min: 20, due_at: at('2026-10-16T06:00'), labels: ['Deep'] })
    const tooLong = task({ project_id: 'W', duration_min: 45, due_at: at('2026-10-16T06:00'), labels: ['Deep'] })
    const otherPlace = task({ project_id: 'H', duration_min: 20, due_at: at('2026-10-16T06:00'), labels: ['Deep'] })
    const overdueFit = task({ area_id: 'A', duration_min: 10, due_at: at('2026-10-14T06:00'), labels: ['Calls'] })
    const f: SmartFilter = { places: ['W', 'A'], length: 30, when: ['today', 'overdue'], labels: ['Deep', 'Calls'] }
    expect(ids([fit, tooLong, otherPlace, overdueFit], f)).toEqual([fit.id, overdueFit.id])
    expect(smartMatch(fit, { ...f, planned: true }, CAIRO)).toBe(false)
    expect(smartMatch(fit, { ...f, text: 'a task' }, CAIRO)).toBe(true)
  })

  it('a Someday task needs Someday picked, even with other days picked', () => {
    const parked = task({ someday: true, labels: ['Ideas'] })
    expect(ids([parked], { labels: ['Ideas'] })).toEqual([])
    expect(ids([parked], { labels: ['Ideas'], when: ['today', 'someday'] })).toEqual([parked.id])
  })
})

describe('describeFilter — the list’s caption', () => {
  it('says each condition in plain words', () => {
    const names: Record<string, string> = { W: 'Work' }
    expect(describeFilter({ places: ['W'], labels: ['Deep', 'Calls'], when: ['week', 'none'], priority: 2, length: 30, planned: false, text: 'call', show_done: true }, (id) => names[id]))
      .toBe('Work · Deep or Calls · This week or No date · !! or more · ≤ 30 min · Not on the calendar · “call” · done ones too')
    expect(describeFilter({}, () => undefined)).toBe('Every open task')
    expect(describeFilter({ places: ['gone'] }, () => undefined)).toBe('a place that is gone')
  })
})
