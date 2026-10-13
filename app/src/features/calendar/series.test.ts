import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../lib/types'
import { buildRule, repeatStart, type RepeatSpec } from '../tasks/repeatRule'
import { alignToRule, detachedCopy, expandEvents, findBlock, rerule, retimeSeries, rowOf, splitSeries, withExdate, withoutExdate, withRuleParts } from './series'

// Exact UTC instants and explicit zones throughout, so these hold under every TZ the suite runs in
// (CI: UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo) — nothing here may read the device zone.

const CAIRO = 'Africa/Cairo'
const LA = 'America/Los_Angeles'
const TOKYO = 'Asia/Tokyo'

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  title: 'Standup',
  starts_at: '2026-10-12T06:00:00.000Z', // Mon 12 Oct, 09:00 Cairo (UTC+3)
  ends_at: '2026-10-12T06:30:00.000Z',
  all_day: false,
  task_id: null,
  source: 'native',
  gcal_id: null,
  gcal_etag: null,
  busy: true,
  type: 'event',
  color: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  ...over,
})

const starts = (list: CalendarEvent[]) => list.map((e) => e.starts_at)
const range = (a: string, b: string) => [new Date(a), new Date(b)] as const

describe('expandEvents', () => {
  it('passes one-off rows through untouched (same array when nothing repeats)', () => {
    const rows = [ev({}), ev({ id: 'e2', starts_at: '2027-05-01T10:00:00.000Z', ends_at: '2027-05-01T11:00:00.000Z' })]
    expect(expandEvents(rows, ...range('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), CAIRO)).toBe(rows)
  })

  it('weekly 09:00 Cairo keeps 09:00 across the end of summer time (last Thursday of October)', () => {
    const out = expandEvents([ev({ recurrence_rule: 'FREQ=WEEKLY' })], ...range('2026-10-12T00:00:00Z', '2026-11-10T00:00:00Z'), CAIRO)
    expect(starts(out)).toEqual([
      '2026-10-12T06:00:00.000Z',
      '2026-10-19T06:00:00.000Z',
      '2026-10-26T06:00:00.000Z',
      '2026-11-02T07:00:00.000Z', // UTC+2 now
      '2026-11-09T07:00:00.000Z',
    ])
    expect(out.every((e) => Date.parse(e.ends_at) - Date.parse(e.starts_at) === 30 * 60_000)).toBe(true)
  })

  it('names each occurrence <row id>::<start> and points back at its series', () => {
    const [first] = expandEvents([ev({ recurrence_rule: 'FREQ=DAILY' })], ...range('2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z'), CAIRO)
    expect(first.id).toBe('e1::2026-10-12T06:00:00.000Z')
    expect(first.seriesId).toBe('e1')
    expect(first.title).toBe('Standup')
  })

  it("Cairo's repeated hour reads as its second (winter) pass, like zoneToIso", () => {
    // Thu 23:30 weekly: 22 Oct is UTC+3; on 29 Oct 23:00–24:00 happens twice.
    const row = ev({ starts_at: '2026-10-22T20:30:00.000Z', ends_at: '2026-10-22T21:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY' })
    expect(starts(expandEvents([row], ...range('2026-10-22T00:00:00Z', '2026-11-06T00:00:00Z'), CAIRO))).toEqual([
      '2026-10-22T20:30:00.000Z',
      '2026-10-29T21:30:00.000Z',
      '2026-11-05T21:30:00.000Z',
    ])
  })

  it('America/Los_Angeles: Saturday 09:00 stays 09:00 when PDT ends (1 Nov 2026)', () => {
    const row = ev({ starts_at: '2026-10-24T16:00:00.000Z', ends_at: '2026-10-24T17:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY' })
    expect(starts(expandEvents([row], ...range('2026-10-20T00:00:00Z', '2026-11-10T00:00:00Z'), LA))).toEqual([
      '2026-10-24T16:00:00.000Z',
      '2026-10-31T16:00:00.000Z',
      '2026-11-07T17:00:00.000Z',
    ])
  })

  it('reads the rule on the zone it is given, not the device', () => {
    // The same stored instant is Monday 09:00 in Cairo but Sunday 23:00 in Los Angeles.
    const row = ev({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO' })
    const r = range('2026-10-12T00:00:00Z', '2026-10-27T00:00:00Z')
    expect(starts(expandEvents([row], ...r, CAIRO))).toEqual(['2026-10-12T06:00:00.000Z', '2026-10-19T06:00:00.000Z', '2026-10-26T06:00:00.000Z'])
    // In LA the anchor is a Sunday, so BYDAY=MO starts the next day at 23:00 LA (06:00Z Tuesday).
    expect(starts(expandEvents([row], ...r, LA))).toEqual(['2026-10-13T06:00:00.000Z', '2026-10-20T06:00:00.000Z'])
  })

  it('skips the exdates', () => {
    const row = ev({ recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-19T06:00:00.000Z'] })
    expect(starts(expandEvents([row], ...range('2026-10-12T00:00:00Z', '2026-10-27T00:00:00Z'), CAIRO))).toEqual(['2026-10-12T06:00:00.000Z', '2026-10-26T06:00:00.000Z'])
  })

  it('only occurrences overlapping the range — one running into it counts', () => {
    const row = ev({ starts_at: '2026-10-12T20:00:00.000Z', ends_at: '2026-10-12T23:00:00.000Z', recurrence_rule: 'FREQ=DAILY' })
    // [22:00Z 13 Oct, 22:00Z 14 Oct): the 13th's (20–23Z) runs in, the 14th's starts inside.
    expect(starts(expandEvents([row], ...range('2026-10-13T22:00:00Z', '2026-10-14T22:00:00Z'), CAIRO))).toEqual(['2026-10-13T20:00:00.000Z', '2026-10-14T20:00:00.000Z'])
  })

  it('an all-day series is a date in no zone', () => {
    const row = ev({ all_day: true, starts_at: '2026-10-12T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY' })
    for (const zone of [CAIRO, LA, 'Asia/Tokyo']) {
      const out = expandEvents([row], ...range('2026-10-14T00:00:00Z', '2026-10-31T00:00:00Z'), zone)
      expect(starts(out)).toEqual(['2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z'])
      expect(out[0].ends_at).toBe('2026-10-20T00:00:00.000Z')
    }
  })

  it('monthly on the 31st skips the short months (RFC 5545)', () => {
    const row = ev({ starts_at: '2026-10-31T07:00:00.000Z', ends_at: '2026-10-31T08:00:00.000Z', recurrence_rule: 'FREQ=MONTHLY' })
    expect(starts(expandEvents([row], ...range('2026-10-01T00:00:00Z', '2027-02-01T00:00:00Z'), CAIRO))).toEqual(['2026-10-31T07:00:00.000Z', '2026-12-31T07:00:00.000Z', '2027-01-31T07:00:00.000Z'])
  })

  it('is idempotent and sorts by start among one-offs; trashed series and bad rules never break it', () => {
    const rows = [
      ev({ id: 'a', starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T09:00:00.000Z' }),
      ev({ recurrence_rule: 'FREQ=DAILY' }),
      ev({ id: 'gone', recurrence_rule: 'FREQ=DAILY', deleted_at: '2026-10-01T00:00:00.000Z' }),
      ev({ id: 'bad', recurrence_rule: 'FREQ=NOPE' }),
    ]
    const r = range('2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z')
    const once = expandEvents(rows, ...r, CAIRO)
    expect(once.map((e) => e.id)).toEqual(['bad', 'e1::2026-10-12T06:00:00.000Z', 'e1::2026-10-13T06:00:00.000Z', 'a'])
    expect(expandEvents(once, ...r, CAIRO)).toEqual(once)
  })
})

describe('series row edits', () => {
  const row = ev({ recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-26T06:00:00.000Z'] })
  const occ = (start: string, end: string) => ({ ...row, id: `e1::${start}`, starts_at: start, ends_at: end, seriesId: 'e1' })

  it('withExdate / withoutExdate add and take back one start, once', () => {
    const skip = withExdate(row, '2026-10-19T06:00:00.000Z')
    expect(skip.recurrence_exdates).toEqual(['2026-10-26T06:00:00.000Z', '2026-10-19T06:00:00.000Z'])
    expect(withExdate(skip, '2026-10-19T06:00:00.000Z')).toBe(skip)
    expect(withoutExdate(skip, '2026-10-19T06:00:00.000Z').recurrence_exdates).toEqual(['2026-10-26T06:00:00.000Z'])
  })

  it('detachedCopy is a one-off pointing at its series, with no client-only field', () => {
    const copy = detachedCopy({ ...row, seriesId: 'x' }, '2026-10-19T09:00:00.000Z', '2026-10-19T09:30:00.000Z', false, 'new', '2026-10-12T07:00:00.000Z')
    expect(copy).toMatchObject({ id: 'new', series_id: 'e1', recurrence_rule: null, recurrence_exdates: [], starts_at: '2026-10-19T09:00:00.000Z', title: 'Standup' })
    expect('seriesId' in copy).toBe(false)
  })

  it('retimeSeries moves the anchor and every skipped start to the new wall time', () => {
    const out = retimeSeries(row, '14:00', 60, CAIRO)
    expect(out.starts_at).toBe('2026-10-12T11:00:00.000Z')
    expect(out.ends_at).toBe('2026-10-12T12:00:00.000Z')
    expect(out.recurrence_exdates).toEqual(['2026-10-26T11:00:00.000Z'])
    // …and the skipped Monday is still the one skipped, across the DST switch.
    expect(starts(expandEvents([out], ...range('2026-10-12T00:00:00Z', '2026-11-03T00:00:00Z'), CAIRO))).toEqual(['2026-10-12T11:00:00.000Z', '2026-10-19T11:00:00.000Z', '2026-11-02T12:00:00.000Z'])
  })

  it('rerule on a one-off sets the rule; on an occurrence the series re-anchors there', () => {
    expect(rerule(ev({}), ev({}), 'FREQ=DAILY').recurrence_rule).toBe('FREQ=DAILY')
    const o = occ('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z')
    const never = rerule(row, o, null)
    expect(never).toMatchObject({ recurrence_rule: null, recurrence_exdates: [], starts_at: '2026-10-19T06:00:00.000Z' })
    const daily = rerule(row, o, 'FREQ=DAILY')
    expect(daily).toMatchObject({ recurrence_rule: 'FREQ=DAILY', starts_at: '2026-10-19T06:00:00.000Z', recurrence_exdates: ['2026-10-26T06:00:00.000Z'] })
  })

  it('findBlock: by id, else its series’ occurrence nearest where it was', () => {
    const r = [new Date('2026-10-12T00:00:00Z'), new Date('2026-10-27T00:00:00Z')] as const
    const list = expandEvents([row, ev({ id: 'other' })], ...r, CAIRO)
    expect(findBlock(list, 'e1::2026-10-19T06:00:00.000Z', 'x')?.starts_at).toBe('2026-10-19T06:00:00.000Z')
    // re-timed to 14:00: the old id is gone; the same Monday's occurrence is the one
    const moved = expandEvents([retimeSeries(row, '14:00', 30, CAIRO)], ...r, CAIRO)
    expect(findBlock(moved, 'e1::2026-10-19T06:00:00.000Z', '2026-10-19T06:00:00.000Z')?.id).toBe('e1::2026-10-19T11:00:00.000Z')
    // no longer repeating: the row itself
    expect(findBlock([ev({})], 'e1::2026-10-19T06:00:00.000Z', '2026-10-19T06:00:00.000Z')?.id).toBe('e1')
    expect(findBlock(list, 'nope', 'x')).toBeUndefined()
  })

  it('rowOf finds the series row behind an occurrence', () => {
    expect(rowOf(occ('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z'), [ev({ id: 'z' }), row])).toBe(row)
    expect(rowOf({ id: 'e1::whatever' }, [row])).toBe(row)
  })
})

describe('splitSeries — "this and following" (conductor decision 2026-10-12)', () => {
  const weekly = ev({ recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-26T06:00:00.000Z'] })
  const at = (start: string, end: string) => ({ starts_at: start, ends_at: end })
  const NOW = '2026-10-12T10:00:00.000Z'
  const win = range('2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z')

  it('ends the series just before the occurrence and starts a new one there — together they draw exactly what the one did', () => {
    const split = splitSeries(weekly, at('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z'), 'e2', NOW, CAIRO)!
    expect(split.head).toMatchObject({ id: 'e1', starts_at: weekly.starts_at, recurrence_rule: 'FREQ=WEEKLY;UNTIL=20261019T055959Z', recurrence_exdates: [] })
    expect(split.tail).toMatchObject({ id: 'e2', starts_at: '2026-10-19T06:00:00.000Z', ends_at: '2026-10-19T06:30:00.000Z', recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-26T06:00:00.000Z'], series_id: null, created_at: NOW })
    expect(starts(expandEvents([split.head, split.tail], ...win, CAIRO))).toEqual(starts(expandEvents([weekly], ...win, CAIRO)))
  })

  it('across the end of Cairo summer time (UNTIL in UTC, read on the wall clock)', () => {
    const split = splitSeries(weekly, at('2026-11-02T07:00:00.000Z', '2026-11-02T07:30:00.000Z'), 'e2', NOW, CAIRO)!
    expect(split.head.recurrence_rule).toBe('FREQ=WEEKLY;UNTIL=20261102T065959Z')
    expect(split.head.recurrence_exdates).toEqual(['2026-10-26T06:00:00.000Z'])
    expect(starts(expandEvents([split.head, split.tail], ...win, CAIRO))).toEqual(starts(expandEvents([weekly], ...win, CAIRO)))
  })

  it('reads the zone it is given (Los Angeles), not the device', () => {
    const row = ev({ starts_at: '2026-10-24T16:00:00.000Z', ends_at: '2026-10-24T17:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY' })
    const split = splitSeries(row, at('2026-11-07T17:00:00.000Z', '2026-11-07T18:00:00.000Z'), 'e2', NOW, LA)!
    expect(split.head.recurrence_rule).toBe('FREQ=WEEKLY;UNTIL=20261107T165959Z')
    expect(starts(expandEvents([split.head, split.tail], ...win, LA))).toEqual(starts(expandEvents([row], ...win, LA)))
  })

  it('COUNT: the head is bounded by UNTIL, the tail keeps what was left (skipped starts count too)', () => {
    const row = ev({ recurrence_rule: 'FREQ=DAILY;COUNT=5', recurrence_exdates: ['2026-10-13T06:00:00.000Z'] })
    const split = splitSeries(row, at('2026-10-14T06:00:00.000Z', '2026-10-14T06:30:00.000Z'), 'e2', NOW, CAIRO)!
    expect(split.head.recurrence_rule).toBe('FREQ=DAILY;UNTIL=20261014T055959Z')
    expect(split.tail.recurrence_rule).toBe('FREQ=DAILY;COUNT=3')
    expect(starts(expandEvents([split.head, split.tail], ...win, CAIRO))).toEqual(['2026-10-12T06:00:00.000Z', '2026-10-14T06:00:00.000Z', '2026-10-15T06:00:00.000Z', '2026-10-16T06:00:00.000Z'])
  })

  it('an all-day series splits on its dates', () => {
    const row = ev({ all_day: true, starts_at: '2026-10-12T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY' })
    const split = splitSeries(row, at('2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z'), 'e2', NOW, LA)!
    expect(split.head.recurrence_rule).toBe('FREQ=WEEKLY;UNTIL=20261025T235959Z')
    expect(starts(expandEvents([split.head, split.tail], ...win, 'Asia/Tokyo'))).toEqual(starts(expandEvents([row], ...win, 'Asia/Tokyo')))
  })

  it('null when nothing of the series is left before the occurrence — the first one, or every earlier one skipped', () => {
    expect(splitSeries(weekly, at(weekly.starts_at, weekly.ends_at), 'e2', NOW, CAIRO)).toBeNull()
    const skipped = ev({ recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-12T06:00:00.000Z'] })
    expect(splitSeries(skipped, at('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z'), 'e2', NOW, CAIRO)).toBeNull()
    expect(splitSeries(ev({}), at('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z'), 'e2', NOW, CAIRO)).toBeNull()
    expect(splitSeries(ev({ recurrence_rule: 'FREQ=NOPE' }), at('2026-10-19T06:00:00.000Z', '2026-10-19T06:30:00.000Z'), 'e2', NOW, CAIRO)).toBeNull()
  })

  it('withRuleParts replaces, drops and appends parts', () => {
    expect(withRuleParts('FREQ=DAILY;COUNT=5;INTERVAL=2', { COUNT: null, UNTIL: '20261019T085959Z' })).toBe('FREQ=DAILY;INTERVAL=2;UNTIL=20261019T085959Z')
    expect(withRuleParts('FREQ=WEEKLY;UNTIL=20270101T000000Z', { UNTIL: '20261019T085959Z' })).toBe('FREQ=WEEKLY;UNTIL=20261019T085959Z')
  })
})

describe('what the Repeat editor writes (tasks/repeatRule), expanded through _shared/series', () => {
  // A Cairo 22:00 block (19:00Z) on Monday 12 Oct 2026 — late enough that UNTIL's zone matters.
  const late = ev({ starts_at: '2026-10-12T19:00:00.000Z', ends_at: '2026-10-12T20:00:00.000Z' })
  const win = range('2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z')
  const from = (zone: string) => repeatStart(new Date(late.starts_at), zone)
  const spec = (over: Partial<RepeatSpec>): RepeatSpec => ({ unit: 'week', every: 1, days: ['MO'], monthly: { by: 'day', day: 12 }, ends: { by: 'never' }, ...over })
  const run = (rule: string, zone = CAIRO, row = late) => starts(expandEvents([{ ...row, recurrence_rule: rule }], ...win, zone))

  it('BYDAY: Mon, Wed, Fri', () => {
    const rule = buildRule(spec({ days: ['MO', 'WE', 'FR'] }), from(CAIRO), CAIRO)
    expect(rule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(run(rule).slice(0, 4)).toEqual(['2026-10-12T19:00:00.000Z', '2026-10-14T19:00:00.000Z', '2026-10-16T19:00:00.000Z', '2026-10-19T19:00:00.000Z'])
  })

  it('every 2 weeks', () => {
    const rule = buildRule(spec({ every: 2 }), from(CAIRO), CAIRO)
    expect(run(rule).slice(0, 3)).toEqual(['2026-10-12T19:00:00.000Z', '2026-10-26T19:00:00.000Z', '2026-11-09T20:00:00.000Z'])
  })

  it('the Nth weekday: the 2nd Monday, and the last Monday', () => {
    const second = buildRule(spec({ unit: 'month', monthly: { by: 'weekday', nth: 2, day: 'MO' } }), from(CAIRO), CAIRO)
    expect(run(second).slice(0, 3)).toEqual(['2026-10-12T19:00:00.000Z', '2026-11-09T20:00:00.000Z', '2026-12-14T20:00:00.000Z'])
    const last = buildRule(spec({ unit: 'month', monthly: { by: 'weekday', nth: -1, day: 'MO' } }), from(CAIRO), CAIRO)
    expect(run(last).slice(0, 3)).toEqual(['2026-10-26T19:00:00.000Z', '2026-11-30T20:00:00.000Z', '2026-12-28T20:00:00.000Z'])
  })

  it('BYSETPOS (an imported rule): the last weekday of each month', () => {
    expect(run('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1').slice(0, 3)).toEqual(['2026-10-30T20:00:00.000Z', '2026-11-30T20:00:00.000Z', '2026-12-31T20:00:00.000Z'])
  })

  it('ends after N times (COUNT)', () => {
    const rule = buildRule(spec({ unit: 'day', ends: { by: 'count', count: 3 } }), from(CAIRO), CAIRO)
    expect(run(rule)).toEqual(['2026-10-12T19:00:00.000Z', '2026-10-13T19:00:00.000Z', '2026-10-14T19:00:00.000Z'])
  })

  it('ends on a date (UNTIL, the end of that day on the user’s clock) keeps that day’s late block — in Cairo and in Los Angeles', () => {
    const rule = buildRule(spec({ unit: 'day', ends: { by: 'date', date: '2026-10-14' } }), from(CAIRO), CAIRO)
    expect(run(rule)).toEqual(['2026-10-12T19:00:00.000Z', '2026-10-13T19:00:00.000Z', '2026-10-14T19:00:00.000Z'])
    // 23:00 in LA (06:00Z next day) on Mon 12 Oct, until Wed 14 Oct LA
    const la = ev({ starts_at: '2026-10-13T06:00:00.000Z', ends_at: '2026-10-13T07:00:00.000Z' })
    const laRule = buildRule(spec({ unit: 'day', ends: { by: 'date', date: '2026-10-14' } }), repeatStart(new Date(la.starts_at), LA), LA)
    expect(run(laRule, LA, la)).toEqual(['2026-10-13T06:00:00.000Z', '2026-10-14T06:00:00.000Z', '2026-10-15T06:00:00.000Z'])
  })

  it('a split keeps the editor’s rule parts on the new series', () => {
    const rule = buildRule(spec({ days: ['MO', 'WE'], ends: { by: 'count', count: 6 } }), from(CAIRO), CAIRO)
    const row = { ...late, recurrence_rule: rule }
    const split = splitSeries(row, { starts_at: '2026-10-19T19:00:00.000Z', ends_at: '2026-10-19T20:00:00.000Z' }, 'e2', '2026-10-12T10:00:00.000Z', CAIRO)!
    expect(split.tail.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')
    expect(starts(expandEvents([split.head, split.tail], ...win, CAIRO))).toEqual(run(rule))
  })
})

describe('alignToRule — a rule that skips the block’s own day (conductor 2026-10-13)', () => {
  const WEEKDAYS = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
  // Saturday 17 Oct 2026, 09:00 Cairo (06:00Z)
  const sat = ev({ id: 'sat', starts_at: '2026-10-17T06:00:00.000Z', ends_at: '2026-10-17T06:30:00.000Z', recurrence_rule: WEEKDAYS })
  const NOW = '2026-10-12T10:00:00.000Z'

  it('Saturday + every weekday: the block stays a one-off on Saturday, the series starts Monday 09:00', () => {
    const a = alignToRule(sat, 'keep', NOW, CAIRO)!
    expect(a.series).toMatchObject({ id: 'sat', starts_at: '2026-10-19T06:00:00.000Z', ends_at: '2026-10-19T06:30:00.000Z', recurrence_rule: WEEKDAYS })
    expect(a.keep).toMatchObject({ id: 'keep', starts_at: sat.starts_at, ends_at: sat.ends_at, recurrence_rule: null, series_id: 'sat' })
    const shown = starts(expandEvents([a.series, a.keep], ...range('2026-10-17T00:00:00Z', '2026-10-24T00:00:00Z'), CAIRO))
    expect(shown).toEqual(['2026-10-17T06:00:00.000Z', '2026-10-19T06:00:00.000Z', '2026-10-20T06:00:00.000Z', '2026-10-21T06:00:00.000Z', '2026-10-22T06:00:00.000Z', '2026-10-23T06:00:00.000Z'])
  })

  it('null when the start matches the rule (a Monday + every weekday, or plain weekly)', () => {
    expect(alignToRule({ ...sat, starts_at: '2026-10-19T06:00:00.000Z', ends_at: '2026-10-19T06:30:00.000Z' }, 'k', NOW, CAIRO)).toBeNull()
    expect(alignToRule({ ...sat, recurrence_rule: 'FREQ=WEEKLY' }, 'k', NOW, CAIRO)).toBeNull()
    expect(alignToRule({ ...sat, recurrence_rule: null }, 'k', NOW, CAIRO)).toBeNull()
    expect(alignToRule({ ...sat, recurrence_rule: 'FREQ=NOPE' }, 'k', NOW, CAIRO)).toBeNull()
  })

  it('reads the day on the user’s zone: 06:00Z Saturday is a Friday 23:00 in Los Angeles — that matches', () => {
    expect(alignToRule(sat, 'k', NOW, LA)).toBeNull()
    // …and Sunday 01:00Z is Saturday 18:00 in LA: the series moves to Monday 18:00 LA (Tuesday 01:00Z)
    const la = { ...sat, starts_at: '2026-10-18T01:00:00.000Z', ends_at: '2026-10-18T01:30:00.000Z' }
    expect(alignToRule(la, 'k', NOW, LA)!.series.starts_at).toBe('2026-10-20T01:00:00.000Z')
  })

  it('the Nth-weekday rule from the editor: the 2nd Tuesday of the month from a Wednesday', () => {
    const wed = { ...sat, starts_at: '2026-10-14T06:00:00.000Z', ends_at: '2026-10-14T06:30:00.000Z', recurrence_rule: 'FREQ=MONTHLY;BYDAY=+2TU' }
    expect(alignToRule(wed, 'k', NOW, CAIRO)!.series.starts_at).toBe('2026-11-10T07:00:00.000Z') // UTC+2 by then
  })

  it('an all-day block is its date', () => {
    const day = ev({ id: 'd', all_day: true, starts_at: '2026-10-17T00:00:00.000Z', ends_at: '2026-10-18T00:00:00.000Z', recurrence_rule: WEEKDAYS })
    const a = alignToRule(day, 'k', NOW, TOKYO)!
    expect([a.series.starts_at, a.series.ends_at, a.keep.starts_at]).toEqual(['2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z', '2026-10-17T00:00:00.000Z'])
  })
})
