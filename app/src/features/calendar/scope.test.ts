import { describe, expect, it } from 'vitest'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { zoneTimeKey, zoneToIso } from './eventTime'
import { planScope, shiftByDay, type Scope, type ScopePlan, type SeriesChange } from './scope'
import { expandEvents } from './series'

// cal-clicks: every answer to "This event · This and following events · All events" for every change, on a series
// that crosses the end of summer time (Cairo: Thu 29 Oct 2026; Los Angeles: Sun 1 Nov 2026) and, below, the start
// of it (Los Angeles: Sun 14 Mar 2027). Explicit zones throughout — the suite also runs under TZ = each of them.

const ZONES = ['Africa/Cairo', 'UTC', 'America/Los_Angeles', 'Asia/Tokyo'] as const
const NOW = '2026-10-15T10:00:00.000Z'

function series(zone: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 's1', title: 'Standup', starts_at: zoneToIso('2026-10-19', '09:00', zone), ends_at: zoneToIso('2026-10-19', '09:30', zone), all_day: false,
    task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4', recurrence_exdates: [], created_at: NOW, updated_at: NOW, ...over,
  }
}

/** The stored rows after a plan (Trash = gone), expanded on `zone`'s clock: "YYYY-MM-DD HH:MM–HH:MM title". */
function after(rows: CalendarEvent[], plan: ScopePlan, zone: string, from = '2026-10-01', to = '2026-12-01'): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const w of plan.write) byId.set(w.id, w)
  for (const t of plan.trash) byId.delete(t.id)
  const out = expandEvents([...byId.values()], new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`), zone)
  const hm = (s: string) => zoneTimeKey(new Date(s), zone)
  return out.map((e) => `${zoneDateKey(new Date(e.starts_at), zone)} ${hm(e.starts_at)}–${hm(e.ends_at)} ${e.title}`).sort()
}

let n = 0
const ctx = (zone: string, detached: CalendarEvent[] = []) => ({ newId: () => `n${++n}`, now: NOW, zone, detached })
const occ = (zone: string, day: string, from = '09:00', to = '09:30') => ({ starts_at: zoneToIso(day, from, zone), ends_at: zoneToIso(day, to, zone), all_day: false })
const run = (zone: string, scope: Scope, change: SeriesChange, row = series(zone), extra: CalendarEvent[] = []) => after([row, ...extra], planScope(row, occ(zone, '2026-11-02'), scope, change, ctx(zone, extra)), zone)

describe.each(ZONES)('planScope on a weekly 09:00 series across the end of summer time — %s', (zone) => {
  it('the series as stored: four Mondays at 09:00 on the wall clock', () => {
    expect(after([series(zone)], { write: [], trash: [], created: [], ref: null }, zone)).toEqual([
      '2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 09:00–09:30 Standup', '2026-11-09 09:00–09:30 Standup',
    ])
  })

  it('edit (title / colour / project …): this · following · all', () => {
    const rename: SeriesChange = { kind: 'patch', patch: { title: 'Sync' } }
    expect(run(zone, 'this', rename)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 09:00–09:30 Sync', '2026-11-09 09:00–09:30 Standup'])
    expect(run(zone, 'following', rename)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 09:00–09:30 Sync', '2026-11-09 09:00–09:30 Sync'])
    expect(run(zone, 'all', rename)).toEqual(['2026-10-19 09:00–09:30 Sync', '2026-10-26 09:00–09:30 Sync', '2026-11-02 09:00–09:30 Sync', '2026-11-09 09:00–09:30 Sync'])
    // A patch never moves anything, even when it carries times.
    const p = planScope(series(zone), occ(zone, '2026-11-02'), 'all', { kind: 'patch', patch: { color: 'moss', starts_at: 'x', ends_at: 'y' } }, ctx(zone))
    expect(p.write[0]).toMatchObject({ color: 'moss', starts_at: series(zone).starts_at })
  })

  it('"this" leaves an exception linked to the series; "following" splits with COUNT carried; "all" edits in place', () => {
    const row = series(zone)
    const one = planScope(row, occ(zone, '2026-11-02'), 'this', { kind: 'patch', patch: { title: 'Sync' } }, ctx(zone))
    expect(one.write[0].recurrence_exdates).toEqual([zoneToIso('2026-11-02', '09:00', zone)])
    expect(one.write[1]).toMatchObject({ series_id: 's1', recurrence_rule: null, title: 'Sync' })
    expect(one.created).toEqual([one.write[1].id])
    expect(one.ref).toEqual({ id: one.write[1].id, start: one.write[1].starts_at })
    const fol = planScope(row, occ(zone, '2026-11-02'), 'following', { kind: 'patch', patch: { title: 'Sync' } }, ctx(zone))
    expect(fol.write[0].recurrence_rule).toMatch(/UNTIL=/)
    expect(fol.write[1].recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=2')
    expect(fol.created).toEqual([fol.write[1].id])
    const all = planScope(row, occ(zone, '2026-11-02'), 'all', { kind: 'patch', patch: { title: 'Sync' } }, ctx(zone))
    expect(all.write.map((w) => w.id)).toEqual(['s1'])
    expect(all.created).toEqual([])
  })

  it('"following" from the first occurrence is the whole series (nothing earlier to keep)', () => {
    const row = series(zone)
    const p = planScope(row, occ(zone, '2026-10-19'), 'following', { kind: 'patch', patch: { title: 'Sync' } }, ctx(zone))
    expect(p.write.map((w) => w.id)).toEqual(['s1'])
  })

  it('time — a drag / typed time to 10:15–11:00 the same day: this · following · all keep the wall time across DST', () => {
    const move: SeriesChange = { kind: 'time', ...occ(zone, '2026-11-02', '10:15', '11:00') }
    expect(run(zone, 'this', move)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 10:15–11:00 Standup', '2026-11-09 09:00–09:30 Standup'])
    expect(run(zone, 'following', move)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 10:15–11:00 Standup', '2026-11-09 10:15–11:00 Standup'])
    expect(run(zone, 'all', move)).toEqual(['2026-10-19 10:15–11:00 Standup', '2026-10-26 10:15–11:00 Standup', '2026-11-02 10:15–11:00 Standup', '2026-11-09 10:15–11:00 Standup'])
  })

  it('time — a resize (length only): this · following · all', () => {
    const resize: SeriesChange = { kind: 'time', ...occ(zone, '2026-11-02', '09:00', '10:00') }
    expect(run(zone, 'this', resize)).toContain('2026-11-02 09:00–10:00 Standup')
    expect(run(zone, 'this', resize)).toContain('2026-11-09 09:00–09:30 Standup')
    expect(run(zone, 'following', resize)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 09:00–10:00 Standup', '2026-11-09 09:00–10:00 Standup'])
    expect(run(zone, 'all', resize).every((l) => l.includes('09:00–10:00'))).toBe(true)
  })

  it('time — dragged to Tuesday: "this" moves one; "following" / "all" become every Tuesday (BYDAY follows)', () => {
    const tue: SeriesChange = { kind: 'time', ...occ(zone, '2026-11-03', '09:00', '09:30') }
    expect(run(zone, 'this', tue)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-03 09:00–09:30 Standup', '2026-11-09 09:00–09:30 Standup'])
    expect(run(zone, 'following', tue)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-03 09:00–09:30 Standup', '2026-11-10 09:00–09:30 Standup'])
    expect(run(zone, 'all', tue)).toEqual(['2026-10-20 09:00–09:30 Standup', '2026-10-27 09:00–09:30 Standup', '2026-11-03 09:00–09:30 Standup', '2026-11-10 09:00–09:30 Standup'])
  })

  it('an unchanged time is no plan', () => {
    expect(planScope(series(zone), occ(zone, '2026-11-02'), 'all', { kind: 'time', ...occ(zone, '2026-11-02') }, ctx(zone)).write).toEqual([])
  })

  it('delete: this skips one · following ends the series before it (and takes later one-offs) · all takes everything', () => {
    const del: SeriesChange = { kind: 'delete' }
    const moved: CalendarEvent = { ...series(zone), id: 'd1', recurrence_rule: null, series_id: 's1', starts_at: zoneToIso('2026-11-12', '09:00', zone), ends_at: zoneToIso('2026-11-12', '09:30', zone), title: 'Moved standup' }
    const early: CalendarEvent = { ...moved, id: 'd0', starts_at: zoneToIso('2026-10-22', '09:00', zone), ends_at: zoneToIso('2026-10-22', '09:30', zone), title: 'Early standup' }
    expect(run(zone, 'this', del)).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-09 09:00–09:30 Standup'])
    expect(run(zone, 'following', del, series(zone), [early, moved])).toEqual(['2026-10-19 09:00–09:30 Standup', '2026-10-22 09:00–09:30 Early standup', '2026-10-26 09:00–09:30 Standup'])
    expect(run(zone, 'all', del, series(zone), [early, moved])).toEqual([])
    // From the first occurrence, "following" is the whole series.
    const first = planScope(series(zone), occ(zone, '2026-10-19'), 'following', del, ctx(zone))
    expect(first.trash.map((r) => r.id)).toEqual(['s1'])
  })

  it('duplicate: this copies one occurrence (a one-off) · following a new series from it · all the whole series', () => {
    const dup: SeriesChange = { kind: 'duplicate' }
    const base = ['2026-10-19 09:00–09:30 Standup', '2026-10-26 09:00–09:30 Standup', '2026-11-02 09:00–09:30 Standup', '2026-11-09 09:00–09:30 Standup']
    expect(run(zone, 'this', dup)).toEqual([...base, '2026-11-02 09:00–09:30 Standup'].sort())
    expect(run(zone, 'following', dup)).toEqual([...base, '2026-11-02 09:00–09:30 Standup', '2026-11-09 09:00–09:30 Standup'].sort())
    expect(run(zone, 'all', dup)).toEqual([...base, ...base].sort())
    const one = planScope(series(zone), occ(zone, '2026-11-02'), 'this', dup, ctx(zone))
    expect(one.write[0]).toMatchObject({ recurrence_rule: null, series_id: null, source: 'native' })
    expect(one.created).toHaveLength(1)
  })
})

describe.each(ZONES)('planScope across the start of summer time (Los Angeles, Sun 14 Mar 2027) — %s', (zone) => {
  const daily = (z: string): CalendarEvent => ({ ...series(z), recurrence_rule: 'FREQ=DAILY;COUNT=5', starts_at: zoneToIso('2027-03-12', '01:30', z), ends_at: zoneToIso('2027-03-12', '02:30', z) })
  const at = (z: string, day: string, a: string, b: string) => ({ starts_at: zoneToIso(day, a, z), ends_at: zoneToIso(day, b, z), all_day: false })

  it('"following" from the DST day re-times the rest to 08:00 on the wall clock; the earlier ones keep 01:30', () => {
    const row = daily(zone)
    const p = planScope(row, at(zone, '2027-03-14', '01:30', '02:30'), 'following', { kind: 'time', ...at(zone, '2027-03-14', '08:00', '09:00') }, ctx(zone))
    expect(after([row], p, zone, '2027-03-01', '2027-04-01')).toEqual([
      '2027-03-12 01:30–02:30 Standup', '2027-03-13 01:30–02:30 Standup',
      '2027-03-14 08:00–09:00 Standup', '2027-03-15 08:00–09:00 Standup', '2027-03-16 08:00–09:00 Standup',
    ])
  })

  it('"all" moves every day to 08:00, and "this" only the DST day', () => {
    const row = daily(zone)
    const move: SeriesChange = { kind: 'time', ...at(zone, '2027-03-14', '08:00', '09:00') }
    expect(after([row], planScope(row, at(zone, '2027-03-14', '01:30', '02:30'), 'all', move, ctx(zone)), zone, '2027-03-01', '2027-04-01').every((l) => l.includes(' 08:00–09:00 '))).toBe(true)
    const one = after([row], planScope(row, at(zone, '2027-03-14', '01:30', '02:30'), 'this', move, ctx(zone)), zone, '2027-03-01', '2027-04-01')
    expect(one.filter((l) => l.includes(' 08:00–09:00 '))).toEqual(['2027-03-14 08:00–09:00 Standup'])
    expect(one).toHaveLength(5)
  })
})

describe('an all-day series', () => {
  const allDay = (): CalendarEvent => ({ ...series('UTC'), all_day: true, starts_at: '2026-10-19T00:00:00.000Z', ends_at: '2026-10-20T00:00:00.000Z' })
  it.each(ZONES)('"all" moved a day later moves every day (no zone in a date) — %s', (zone) => {
    const row = allDay()
    const p = planScope(row, { starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-03T00:00:00.000Z', all_day: true }, 'all', { kind: 'time', starts_at: '2026-11-03T00:00:00.000Z', ends_at: '2026-11-04T00:00:00.000Z' }, ctx(zone))
    expect(p.write[0]).toMatchObject({ starts_at: '2026-10-20T00:00:00.000Z', ends_at: '2026-10-21T00:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY;COUNT=4;BYDAY=TU' })
  })
})

describe('shiftByDay', () => {
  it('moves each weekday, keeps a position prefix, wraps the week', () => {
    expect(shiftByDay('FREQ=WEEKLY;BYDAY=MO,WE', 1)).toBe('FREQ=WEEKLY;BYDAY=TU,TH')
    expect(shiftByDay('FREQ=MONTHLY;BYDAY=2SU', -1)).toBe('FREQ=MONTHLY;BYDAY=2SA')
    expect(shiftByDay('FREQ=WEEKLY;BYDAY=SA', 8)).toBe('FREQ=WEEKLY;BYDAY=SU')
    expect(shiftByDay('FREQ=DAILY', 3)).toBe('FREQ=DAILY')
    expect(shiftByDay('FREQ=WEEKLY;BYDAY=MO', 7)).toBe('FREQ=WEEKLY;BYDAY=MO')
  })
})
