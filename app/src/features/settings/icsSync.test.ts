import { describe, expect, it, vi } from 'vitest'
// The edge function's pure calendar-subscription logic — Deno-free on purpose so it runs here, in four time zones
// (the parser must not read the machine's clock). The Deno suite (supabase/tests/ics.test.ts) holds the long list; this
// is the real prayer feed and the SSRF guard, under every TZ the gate uses.
import { buildRows, hostProblem, normalizeFeedUrl, parseFeed } from '../../../../supabase/functions/_shared/ics.ts'
import { calendarIcs } from '../export/files'
import { isSynced } from '../calendar/blockMenuSpec'
import { ruleBetween } from '../calendar/series'
import { subscriptionLine } from './icsApi'
import type { CalendarEvent } from '../../lib/types'
import PRAYER_FEED from '../../../../supabase/tests/fixtures/prayer-times.ics?raw'

// icsApi reads the real client; nothing here calls it.
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const fixture = (_n: 'prayer-times.ics') => PRAYER_FEED
const NOW = new Date('2026-11-06T12:00:00Z')
const window = { start: new Date(NOW.getTime() - 60 * 86_400_000), end: new Date(NOW.getTime() + 400 * 86_400_000) }
const rows = (text: string, zone = 'Africa/Cairo') => {
  const feed = parseFeed(text, zone)
  return { feed, rows: buildRows(feed, { subId: 's1', name: feed.name ?? 'x', color: feed.color, useAlarms: true, window, between: ruleBetween }) }
}

describe('the real prayer-times feed (pray.ahmedelywa.com, saved 2026-11-06)', () => {
  const { feed, rows: r } = rows(fixture('prayer-times.ics'))

  it('reads its name, its colour, 644 events, Arabic titles and the 5-minute alarm', () => {
    expect(feed).toMatchObject({ name: 'مواقيت الصلاة', color: '#E91E63', seen: 644 })
    expect(r).toHaveLength(644)
    expect(r[0]).toMatchObject({ title: 'الفجر', starts_at: '2026-11-01T02:42:00.000Z', ends_at: '2026-11-01T03:07:00.000Z', remind_min: 5, color: '#E91E63', source: 'ics', all_day: false })
    expect(new Set(r.map((x) => x.title))).toEqual(new Set(['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء', 'منتصف الليل', 'الجمعة']))
  })

  it('TZID=Africa/Cairo with no VTIMEZONE: 04:42 there is 02:42Z in November (UTC+2) and 01:42Z in summer (UTC+3)', () => {
    const june = fixture('prayer-times.ics').replace('20261101T044200', '20270601T044200').replace('20261101T050700', '20270601T050700')
    expect(rows(june).rows.find((x) => x.starts_at.startsWith('2027-06-01'))!.starts_at).toBe('2027-06-01T01:42:00.000Z')
  })
})

describe('the link', () => {
  it('webcal becomes https; private places and odd schemes are refused', () => {
    expect(normalizeFeedUrl('webcal://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.7952538&color=%23E91E63')!.href).toBe('https://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.7952538&color=%23E91E63')
    expect(normalizeFeedUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeFeedUrl('https://u:p@example.org/a.ics')).toBeNull()
    for (const u of ['http://127.0.0.1/a.ics', 'http://localhost/a.ics', 'http://169.254.169.254/', 'http://[::1]/', 'http://10.0.0.1/', 'http://192.168.1.5/a.ics']) expect(hostProblem(normalizeFeedUrl(u)!)).toBe('blocked')
    expect(hostProblem(normalizeFeedUrl('webcal://pray.ahmedelywa.com/x.ics')!)).toBeNull()
  })
})

describe('a subscribed event in the app', () => {
  const ev: CalendarEvent = {
    id: 'a', title: 'الفجر', starts_at: '2026-11-07T02:42:00.000Z', ends_at: '2026-11-07T03:07:00.000Z', all_day: false, task_id: null, source: 'ics', gcal_id: null, gcal_etag: null,
    busy: true, type: 'event', color: '#E91E63', created_at: '2026-11-06T00:00:00Z', updated_at: '2026-11-06T00:00:00Z', remind_min: 5,
    external_ref: { source: 'ics', id: 's1/u/', calendar: 'مواقيت الصلاة', calendar_id: 's1' },
  }

  it('is a read-only mirror, like a Google event', () => {
    expect(isSynced(ev)).toBe(true)
    expect(isSynced({ ...ev, source: 'native' })).toBe(false)
  })

  it('is left out of our own .ics export (it already lives at its source)', () => {
    const out = calendarIcs([ev, { ...ev, id: 'b', source: 'native', title: 'Mine' }], 'Africa/Cairo', NOW)
    expect(out).toContain('SUMMARY:Mine')
    expect(out).not.toContain('الفجر')
  })

  it('the row says when it was last read, or why not', () => {
    const base = { host: 'pray.ahmedelywa.com', status: 'ok' as const, error: null, synced_at: '2026-11-06T09:00:00Z', event_count: 644 }
    expect(subscriptionLine(base)).toMatch(/^pray\.ahmedelywa\.com · 644 events · updated /)
    expect(subscriptionLine({ ...base, synced_at: null })).toBe('pray.ahmedelywa.com · not read yet')
    expect(subscriptionLine({ ...base, status: 'failing', error: 'timeout' })).toMatch(/took too long.*Last updated/)
    expect(subscriptionLine({ ...base, event_count: 1 })).toContain('1 event ·')
  })
})
