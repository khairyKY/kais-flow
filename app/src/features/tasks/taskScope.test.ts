import { afterAll, describe, expect, it } from 'vitest'
import { setAppZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'
import { zoneTimeKey, zoneToIso } from '../calendar/eventTime'
import { planTaskScope, scopeRows, taskSeries, type TaskScope } from './taskScope'

// cal-clicks: "This one · This and following · All" on a repeating task, on the one-open-row model (./completion).
// The open round is due Mon 26 Oct 09:00, before the end of summer time (Cairo Thu 29 Oct, Los Angeles Sun 1 Nov):
// "This one" spawns the next round at 09:00 on the wall clock on Mon 2 Nov, after it — in every zone.

const ZONES = ['Africa/Cairo', 'UTC', 'America/Los_Angeles', 'Asia/Tokyo'] as const
const NOW = '2026-10-25T08:00:00.000Z'
afterAll(() => setAppZone('Africa/Cairo'))

function round(zone: string, over: Partial<Task> = {}): Task {
  return {
    id: 'open', project_id: null, domain_id: null, area_id: null, title: 'Review inbox', notes: null, status: 'todo',
    due_at: zoneToIso('2026-10-26', '09:00', zone), scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', labels: [], priority: null, duration_min: 30, someday: false, reminder_at: null,
    reminder_sent: false, completed_at: null, created_at: NOW, updated_at: NOW, ...over,
  }
}
const done = (zone: string, id: string, day: string): Task => round(zone, { id, status: 'done', due_at: zoneToIso(day, '09:00', zone), completed_at: zoneToIso(day, '09:10', zone) })
let n = 0
const newId = () => `t${++n}`
const wall = (iso: string | null, zone: string) => (iso ? `${zoneDateKey(new Date(iso), zone)} ${zoneTimeKey(new Date(iso), zone)}` : null)

describe.each(ZONES)('a repeating task — %s', (zone) => {
  const setup = () => {
    setAppZone(zone)
    const open = round(zone)
    const all = [done(zone, 'w1', '2026-10-12'), done(zone, 'w2', '2026-10-19'), open, round(zone, { id: 'other', title: 'Something else' })]
    return { open, all }
  }

  it('its series: the same title and rule (COUNT / UNTIL wear down, the rest stays), live rows only', () => {
    const { open, all } = setup()
    expect(taskSeries(open, all).map((t) => t.id)).toEqual(['open', 'w1', 'w2'])
    expect(taskSeries(open, [...all, done(zone, 'counted', '2026-10-05')].map((t) => (t.id === 'counted' ? { ...t, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3' } : t))).map((t) => t.id)).toContain('counted')
    expect(taskSeries(open, [...all, { ...done(zone, 'gone', '2026-10-05'), deleted_at: NOW }]).map((t) => t.id)).not.toContain('gone')
    expect(taskSeries(round(zone, { recurrence_rule: null }), all).map((t) => t.id)).toEqual(['open'])
  })

  it('edit (title / notes / project): this one detaches and the series goes on, unchanged, from the next round', () => {
    const { open, all } = setup()
    const p = planTaskScope(open, all, 'this', () => ({ title: 'Review inbox — long one' }), NOW, newId)
    expect(p.write).toHaveLength(1)
    expect(p.write[0]).toMatchObject({ id: 'open', title: 'Review inbox — long one', recurrence_rule: null })
    expect(p.spawned).toMatchObject({ title: 'Review inbox', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', status: 'todo' })
    expect(wall(p.spawned!.due_at, zone)).toBe('2026-11-02 09:00') // across the DST end, same wall time
  })

  it('edit: following changes this round (the next ones inherit it); all every round, done ones too', () => {
    const { open, all } = setup()
    const later = round(zone, { id: 'open2', due_at: zoneToIso('2026-11-02', '09:00', zone) })
    const fol = planTaskScope(open, [...all, later], 'following', () => ({ notes: 'zero it' }), NOW, newId)
    expect(fol.write.map((t) => t.id)).toEqual(['open', 'open2'])
    expect(fol.write.every((t) => t.notes === 'zero it' && t.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO')).toBe(true)
    expect(fol.spawned).toBeNull()
    const all3 = planTaskScope(open, all, 'all', () => ({ project_id: 'p1' }), NOW, newId)
    expect(all3.write.map((t) => t.id).sort()).toEqual(['open', 'w1', 'w2'])
    expect(all3.write.every((t) => t.project_id === 'p1')).toBe(true)
  })

  it('scopeRows — what complete / delete / a move take: this · following (open, from here) · all', () => {
    const { open, all } = setup()
    const earlierOpen = round(zone, { id: 'late', due_at: zoneToIso('2026-10-19', '09:00', zone) })
    const rows = [...all, earlierOpen]
    expect(scopeRows(open, rows, 'this').map((t) => t.id)).toEqual(['open'])
    expect(scopeRows(open, rows, 'following').map((t) => t.id)).toEqual(['open'])
    expect(scopeRows(earlierOpen, rows, 'following').map((t) => t.id).sort()).toEqual(['late', 'open'])
    expect(scopeRows(open, rows, 'all').map((t) => t.id).sort()).toEqual(['late', 'open', 'w1', 'w2'])
  })

  it('"this one" on the last of "N times" spawns nothing; a paused series keeps its rule (it can\'t go on without it)', () => {
    const { all } = setup()
    const last = round(zone, { recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=1' })
    const p = planTaskScope(last, all, 'this', () => ({ title: 'x' }), NOW, newId)
    expect(p.spawned).toBeNull()
    expect(p.write[0].recurrence_rule).toBeNull()
    const paused = planTaskScope(round(zone, { paused: true }), all, 'this', () => ({ title: 'x' }), NOW, newId)
    expect(paused.spawned).toBeNull()
    expect(paused.write[0].recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO')
  })

  it('a one-off task: every scope is just this task', () => {
    const { all } = setup()
    const one = round(zone, { recurrence_rule: null })
    for (const s of ['this', 'following', 'all'] as TaskScope[]) {
      const p = planTaskScope(one, all, s, () => ({ title: 'y' }), NOW, newId)
      expect(p.write.map((t) => t.id)).toEqual(['open'])
      expect(p.spawned).toBeNull()
    }
  })
})
