import { describe, expect, it } from 'vitest'
// Your own calendar link (supabase/functions/calendar-feed/feed.ts): the ICS writer, on fixtures, Deno-free so it runs
// here in four time zones (it must not read the machine's clock). The writer's output goes back through the
// subscription parser (_shared/ics.ts parseFeed) — what an app reading the feed would see.
import { buildCalendar, escapeText, feedWindow, fold, HOURLY_LIMIT, planEvents, stamp, type FeedRow, type Held } from '../../../../supabase/functions/calendar-feed/feed.ts'
import { instantOf, parseFeed, unfold } from '../../../../supabase/functions/_shared/ics.ts'
import { ruleBetween } from '../calendar/series'

const NOW = new Date('2026-11-16T09:00:00Z')
const CAIRO = 'Africa/Cairo'
const { from, to } = feedWindow(NOW)
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n: number, title: string, s: string, e: string, over: Partial<FeedRow> = {}): FeedRow => ({
  id: uuid(n), title, starts_at: s, ends_at: e, all_day: false, type: 'event', task_id: null, recurrence_rule: null, recurrence_exdates: null,
  updated_at: '2026-11-10T08:00:00.000Z', ...over,
})
const opts = { zone: CAIRO, from, to, titles: true, includeTasks: true, between: ruleBetween }
const ics = (rows: FeedRow[], held: Held[] = [], o: Partial<typeof opts> = {}) => buildCalendar(planEvents(rows, held, { ...opts, ...o }), CAIRO, NOW)
const events = (text: string) => parseFeed(text, CAIRO).events

describe('folding and escaping (RFC 5545 §3.1, §3.3.11)', () => {
  it('keeps a line to 75 octets, continues with a space, and unfolds back', () => {
    const line = `SUMMARY:${'x'.repeat(200)}`
    const out = fold(line).split('\r\n')
    expect(out.length).toBeGreaterThan(2)
    for (const l of out) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    for (const l of out.slice(1)) expect(l.startsWith(' ')).toBe(true)
    expect(unfold(fold(line).replace(/\r\n/g, '\n'))).toEqual([line])
  })

  it('never splits a multi-byte character: Arabic survives a fold', () => {
    const title = 'اجتماع مراجعة الأسبوع مع الفريق — خطة الربع القادم والميزانية والمهام المتبقية'
    const line = `SUMMARY:${title}`
    const out = fold(line).split('\r\n')
    expect(out.length).toBeGreaterThan(1)
    for (const l of out) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(out.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(line)
  })

  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(escapeText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf')
  })
})

describe('the calendar', () => {
  const text = ics([row(1, 'Standup', '2026-11-17T08:00:00Z', '2026-11-17T08:30:00Z')])

  it('has the header the spec lists, CRLF only, and ends on a line break', () => {
    for (const h of ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Kai's Flow//EN", "X-WR-CALNAME:Kai's Flow", 'X-WR-TIMEZONE:Africa/Cairo', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', 'END:VCALENDAR'])
      expect(text.split('\r\n')).toContain(h)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })

  it('writes a timed event in UTC with its stamps, opaque and confirmed', () => {
    expect(text).toContain('DTSTART:20261117T080000Z\r\n')
    expect(text).toContain('DTEND:20261117T083000Z\r\n')
    expect(text).toContain('DTSTAMP:20261116T090000Z\r\n')
    expect(text).toContain('LAST-MODIFIED:20261110T080000Z\r\n')
    expect(text).toContain('TRANSP:OPAQUE\r\n')
    expect(text).toContain('STATUS:CONFIRMED\r\n')
    expect(text).toContain(`UID:${uuid(1)}@kaisflow\r\n`)
  })

  it('writes an all-day event as dates with an exclusive end — one day and a run of days', () => {
    const t = ics([
      row(2, 'Holiday', '2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z', { all_day: true }),
      row(3, 'Trip', '2026-11-24T00:00:00Z', '2026-11-27T00:00:00Z', { all_day: true }),
      // an older all-day row holds the device's midnight (Cairo UTC+2): the day it names, not the one before
      row(4, 'Old row', '2026-11-29T22:00:00Z', '2026-11-30T22:00:00Z', { all_day: true }),
    ])
    expect(t).toContain('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121\r\n')
    expect(t).toContain('DTSTART;VALUE=DATE:20261124\r\nDTEND;VALUE=DATE:20261127\r\n')
    expect(t).toContain('DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\n')
  })

  it('round-trips through the subscription parser, Arabic and punctuation included', () => {
    const titles = ['Plan, review; ship', 'اجتماع مراجعة الأسبوع مع الفريق — خطة الربع القادم والميزانية والمهام المتبقية', 'back\\slash']
    const t = ics(titles.map((x, i) => row(10 + i, x, `2026-11-18T0${i}:00:00Z`, `2026-11-18T0${i}:45:00Z`)).concat(row(20, 'All day', '2026-11-19T00:00:00Z', '2026-11-20T00:00:00Z', { all_day: true })))
    const got = events(t)
    expect(got.map((e) => e.summary)).toEqual([...titles, 'All day'])
    expect(got[0].start && instantOf(got[0].start)).toBe(Date.parse('2026-11-18T00:00:00Z'))
    expect(got[0].end && instantOf(got[0].end)).toBe(Date.parse('2026-11-18T00:45:00Z'))
    expect(got[3].start?.allDay).toBe(true)
    expect(got[3].end && got[3].end.wall - got[3].start!.wall).toBe(86_400_000)
    expect(got.every((e) => !e.free && !e.cancelled)).toBe(true)
  })
})

describe('what goes in', () => {
  const slot = row(30, 'Deep work', '2026-11-18T07:00:00Z', '2026-11-18T09:00:00Z', { type: 'time_block' })
  const block = row(31, 'Write the report', '2026-11-18T10:00:00Z', '2026-11-18T11:00:00Z', { type: 'task', task_id: uuid(500) })
  const held: Held[] = [
    { slot_id: uuid(30), slot_date: '2026-11-18', title: 'Draft intro' },
    { slot_id: uuid(30), slot_date: '2026-11-18', title: 'Reply, then; file' },
    { slot_id: uuid(30), slot_date: '2026-11-19', title: 'Another day' },
    { slot_id: uuid(99), slot_date: '2026-11-18', title: 'Another block' },
  ]

  it('a Time block lists the tasks it holds that day, one per line', () => {
    const t = ics([slot, block], held)
    expect(t).toContain('DESCRIPTION:Draft intro\\nReply\\, then\\; file\r\n')
    expect(t).not.toContain('Another day')
    expect(t).not.toContain('Another block')
    expect(events(t).map((e) => e.summary)).toEqual(['Deep work', 'Write the report'])
  })

  it('without "Include scheduled tasks": no task blocks and no held tasks', () => {
    const t = ics([slot, block], held, { includeTasks: false })
    expect(events(t).map((e) => e.summary)).toEqual(['Deep work'])
    expect(t).not.toContain('DESCRIPTION')
    expect(t).not.toContain('Draft intro')
  })

  it('Busy only: every entry is "Busy", no title and no description anywhere', () => {
    const t = ics([slot, block, row(32, 'Therapy session', '2026-11-18T12:00:00Z', '2026-11-18T13:00:00Z')], held, { titles: false })
    expect(events(t).map((e) => e.summary)).toEqual(['Busy', 'Busy', 'Busy'])
    for (const secret of ['Deep work', 'Write the report', 'Therapy', 'Draft intro', 'DESCRIPTION']) expect(t).not.toContain(secret)
  })

  it('expands a repeat into occurrences, each with its own UID, skipping an exception', () => {
    const weekly = row(40, 'Gym', '2026-11-16T15:00:00Z', '2026-11-16T16:00:00Z', { recurrence_rule: 'FREQ=WEEKLY;COUNT=4', recurrence_exdates: ['2026-11-23T15:00:00.000Z'] })
    const t = ics([weekly])
    const got = events(t)
    expect(got.map((e) => instantOf(e.start!))).toEqual(['2026-11-16T15:00:00Z', '2026-11-30T15:00:00Z', '2026-12-07T15:00:00Z'].map((x) => Date.parse(x)))
    expect(got.map((e) => e.uid)).toEqual([`${uuid(40)}-20261116T150000Z@kaisflow`, `${uuid(40)}-20261130T150000Z@kaisflow`, `${uuid(40)}-20261207T150000Z@kaisflow`])
    expect(t).not.toContain('RRULE')
  })

  it('a repeat stays at its wall time across a daylight-saving switch (Cairo falls back in the night of 29 Oct 2026)', () => {
    // 09:00 Cairo: 06:00Z in summer time (UTC+3), 07:00Z in winter (UTC+2)
    const daily = row(41, 'Morning', '2026-10-28T06:00:00Z', '2026-10-28T06:30:00Z', { recurrence_rule: 'FREQ=DAILY;COUNT=5' })
    const now = new Date('2026-10-29T00:00:00Z')
    const { from: f, to: t } = feedWindow(now)
    const got = events(buildCalendar(planEvents([daily], [], { ...opts, from: f, to: t }), CAIRO, now)).map((e) => new Date(instantOf(e.start!)).toISOString().slice(0, 16))
    expect(got).toEqual(['2026-10-28T06:00', '2026-10-29T06:00', '2026-10-30T07:00', '2026-10-31T07:00', '2026-11-01T07:00'])
  })

  it('the window is 30 days back to 180 ahead', () => {
    expect(feedWindow(NOW).from.toISOString()).toBe('2026-10-17T09:00:00.000Z')
    expect(feedWindow(NOW).to.toISOString()).toBe('2027-05-15T09:00:00.000Z')
    expect(HOURLY_LIMIT).toBe(120)
  })

  it('stamps are plain UTC basic format', () => {
    expect(stamp(Date.UTC(2026, 10, 16, 9, 5, 7))).toBe('20261116T090507Z')
  })
})
