// ics-subscribe (2026-11-06): the pure half of ics-sync — the link guard (SSRF), the parser, the expansion of repeats,
// time zones, VALARM, and the plan — on fixtures, in plain Deno. No database, no network. ics.sh runs this first,
// then the function against Postgres.
//
//   deno test --no-lock --allow-env --allow-read supabase/tests/ics.test.ts
//
// fixtures/prayer-times.ics is a copy of the REAL feed that started this (pray.ahmedelywa.com, fetched 2026-11-06):
// 644 per-day events, TZID=Africa/Cairo with no VTIMEZONE, Arabic titles, a 5-minute VALARM on each, its colour in
// X-APPLE-CALENDAR-COLOR. fixtures/mixed.ics is hand-made: a weekly repeat with EXDATE, a moved and a cancelled
// instance, all-day, DURATION, floating, UTC, absolute and END-relative alarms, a repeat across a DST switch.
import assert from 'node:assert/strict'
import rrulePkg from 'npm:rrule@2'
import { eventRemindersDue } from '../functions/_shared/eventReminder.ts'
import { buildRows, hexColor, hostProblem, isPrivateIp, looksLikeIcs, normalizeFeedUrl, parseDuration, parseFeed, planIcsSync, unfold, type IcsRow, type StoredIcs } from '../functions/_shared/ics.ts'

const { RRule } = rrulePkg
const between = (rule: string, dtstart: Date, after: Date, before: Date) => new RRule({ ...RRule.parseString(rule), dtstart }).between(after, before, true)
const here = new URL('./fixtures/', import.meta.url)
const read = (n: string) => Deno.readTextFileSync(new URL(n, here))
const NOW = new Date('2026-11-06T12:00:00Z')
const win = { start: new Date(NOW.getTime() - 60 * 86_400_000), end: new Date(NOW.getTime() + 400 * 86_400_000) }
const rowsOf = (text: string, zone = 'Africa/Cairo', over: Partial<{ useAlarms: boolean; color: string | null }> = {}) => {
  const feed = parseFeed(text, zone)
  return { feed, rows: buildRows(feed, { subId: 'sub1', name: feed.name ?? 'x', color: over.color ?? feed.color, useAlarms: over.useAlarms ?? true, window: win, between }) }
}
const byTitle = (rows: IcsRow[], t: string) => rows.filter((r) => r.title === t)

Deno.test('the real prayer feed: shape, colour, Arabic, zone, alarm', () => {
  const text = read('prayer-times.ics')
  assert.ok(looksLikeIcs(text))
  const { feed, rows } = rowsOf(text)
  assert.equal(feed.name, 'مواقيت الصلاة')
  assert.equal(feed.color, '#E91E63')
  assert.equal(feed.seen, 644)
  assert.equal(rows.length, 644)
  const fajr = rows[0]
  assert.equal(fajr.title, 'الفجر')
  assert.equal(fajr.starts_at, '2026-11-01T02:42:00.000Z') // 04:42 Cairo (UTC+2 on 1 Nov 2026)
  assert.equal(fajr.ends_at, '2026-11-01T03:07:00.000Z')
  assert.equal(fajr.remind_min, 5)
  assert.equal(fajr.color, '#E91E63')
  assert.equal(fajr.source, 'ics')
  assert.equal(fajr.all_day, false)
  assert.match(fajr.external_ref.id, /^sub1\/[0-9a-f-]{36}\/$/)
  assert.equal(byTitle(rows, 'الجمعة').length, 13) // the Friday prayer (jumuah=true)
  assert.equal(new Set(rows.map((r) => r.external_ref.id)).size, 644)
})

Deno.test('the switch: without the feed\'s reminders no row has one', () => {
  const { rows } = rowsOf(read('prayer-times.ics'), 'Africa/Cairo', { useAlarms: false })
  assert.ok(rows.every((r) => r.remind_min === null))
})

Deno.test('mixed feed: repeat, EXDATE, moved and cancelled instances, zones', () => {
  const { feed, rows } = rowsOf(read('mixed.ics'), 'Africa/Cairo')
  assert.equal(feed.name, 'Team, work')
  assert.equal(feed.color, '#0088CC')
  // Stand-up: Mondays and Thursdays 09:00 Berlin from 12 Oct. Nov 5 is EXDATEd, Nov 9 moved, Nov 12 cancelled.
  const su = rows.filter((r) => r.external_ref.uid === 'standup@example.test')
  const day = (d: string) => su.filter((r) => r.starts_at.startsWith(d))
  assert.equal(day('2026-11-05').length, 0, 'EXDATE')
  assert.equal(day('2026-11-12').length, 0, 'cancelled instance')
  assert.equal(day('2026-11-09').length, 1)
  assert.equal(day('2026-11-09')[0].title, 'Stand-up (moved to the afternoon)')
  assert.equal(day('2026-11-09')[0].starts_at, '2026-11-09T13:30:00.000Z') // 14:30 Berlin, UTC+1
  assert.equal(day('2026-11-02')[0].starts_at, '2026-11-02T08:00:00.000Z') // 09:00 Berlin
  assert.equal(day('2026-11-02')[0].remind_min, 10)
  assert.equal(day('2026-11-02')[0].external_ref.url, 'https://meet.example.test/standup')
  assert.equal(day('2026-11-02')[0].external_ref.recurrence_id, '2026-11-02T08:00:00.000Z')
  // the series reaches the end of the window (400 days ahead): Mondays and Thursdays
  assert.ok(su.length > 100 && su.length < 140, `series length ${su.length}`)
  // 09:00 Berlin stays 09:00 across the DST switch: UTC+1 → UTC+2
  assert.equal(su.find((r) => r.starts_at.startsWith('2027-06-03'))!.starts_at, '2027-06-03T07:00:00.000Z')
})

Deno.test('mixed feed: all-day, DURATION, folding, floating, alarms, DST, limits', () => {
  const { rows } = rowsOf(read('mixed.ics'), 'Africa/Cairo')
  const hol = rows.find((r) => r.title === 'Two-day holiday')!
  assert.equal(hol.all_day, true)
  assert.equal(hol.starts_at, '2026-11-20T00:00:00.000Z')
  assert.equal(hol.ends_at, '2026-11-22T00:00:00.000Z') // DTEND is exclusive
  assert.equal(hol.busy, false) // TRANSP:TRANSPARENT
  assert.equal(hol.remind_min, null)
  const call = rows.find((r) => r.external_ref.uid === 'utc@example.test')!
  assert.equal(call.title, 'Call with a very long title that the producer folded across lines, with an escaped comma')
  assert.equal(call.ends_at, '2026-11-10T13:30:00.000Z') // DURATION PT1H30M
  assert.equal(call.remind_min, 30) // rings 2 h before the END of a 90-minute event = 30 min before the start
  const dinner = rows.find((r) => r.title === 'Floating dinner')!
  assert.equal(dinner.starts_at, '2026-11-11T17:00:00.000Z') // floating: the feed's X-WR-TIMEZONE (Berlin, UTC+1), not the person's Cairo
  const abs = rows.find((r) => r.title === 'Absolute alarm')!
  assert.equal(abs.remind_min, 15)
  assert.equal(rows.filter((r) => r.title === 'Cancelled').length, 0)
  assert.equal(rows.filter((r) => r.title === 'Far in the past').length, 0) // before the window
  assert.equal(rows.filter((r) => r.title === 'Far in the future').length, 0) // after the window
  assert.equal(rows.filter((r) => r.title === 'No usable start').length, 0)
  const daily = rows.filter((r) => r.external_ref.uid === 'daily@example.test')
  assert.equal(daily.length, 62) // 1 Nov … 1 Jan inclusive: UNTIL is a date
  assert.ok(daily.every((r) => r.all_day && r.ends_at.slice(0, 10) > r.starts_at.slice(0, 10)))
  // 09:30 Berlin: UTC+1 until 28 Mar 2027, then UTC+2
  const dst = rows.filter((r) => r.external_ref.uid === 'dst@example.test').map((r) => r.starts_at)
  assert.deepEqual(dst, ['2027-03-25T08:30:00.000Z', '2027-03-26T08:30:00.000Z', '2027-03-27T08:30:00.000Z', '2027-03-28T07:30:00.000Z'])
  // ids are unique, sorted by start
  assert.equal(new Set(rows.map((r) => r.external_ref.id)).size, rows.length)
  assert.deepEqual(rows.map((r) => r.starts_at), [...rows.map((r) => r.starts_at)].sort())
})

Deno.test('a feed with no zone data reads floating times on the person\'s clock, and X-WR-TIMEZONE wins over it', () => {
  const t = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261111T180000\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  assert.equal(rowsOf(t, 'Asia/Tokyo').rows[0].starts_at, '2026-11-11T09:00:00.000Z')
  const withTz = t.replace('BEGIN:VEVENT', 'X-WR-TIMEZONE:America/New_York\r\nBEGIN:VEVENT')
  assert.equal(rowsOf(withTz, 'Asia/Tokyo').rows[0].starts_at, '2026-11-11T23:00:00.000Z')
  // an unknown TZID falls back instead of failing
  const odd = t.replace('DTSTART:', 'DTSTART;TZID=W. Europe Standard Time:')
  assert.equal(rowsOf(odd, 'Asia/Tokyo').rows[0].starts_at, '2026-11-11T09:00:00.000Z')
})

Deno.test('the parser: lines, durations, colours, junk', () => {
  assert.deepEqual(unfold('A:1\r\n 2\r\nB:3\n\tx\nC:4'), ['A:12', 'B:3x', 'C:4'])
  assert.equal(parseDuration('-PT5M'), -300_000)
  assert.equal(parseDuration('P1W'), 7 * 86_400_000)
  assert.equal(parseDuration('PT1H30M'), 5_400_000)
  assert.equal(parseDuration('nonsense'), null)
  assert.equal(hexColor('#e91e63'), '#E91E63')
  assert.equal(hexColor('#E91E63FF'), '#E91E63')
  assert.equal(hexColor('red'), null)
  assert.ok(!looksLikeIcs('<!doctype html><html>'))
  // an HTML page, an empty calendar and binary junk are no events and no crash
  assert.equal(parseFeed('<html>nope</html>', 'UTC').events.length, 0)
  assert.equal(parseFeed('BEGIN:VCALENDAR\nEND:VCALENDAR', 'UTC').events.length, 0)
  assert.equal(parseFeed('\u0000\u0001\u0002;;;:::\n===\nBEGIN:VEVENT\nDTSTART;;:\nEND:VEVENT', 'UTC').events.length, 0)
})

Deno.test('too many rows: refused, not cut', () => {
  const ev = 'BEGIN:VEVENT\nUID:d\nDTSTART:20261107T100000Z\nDTEND:20261107T110000Z\nRRULE:FREQ=DAILY\nSUMMARY:d\nEND:VEVENT\n'
  // a daily repeat is one row a day to the window's end (400); fine. FREQ=HOURLY is one event (not 11 000 rows).
  assert.equal(rowsOf(`BEGIN:VCALENDAR\n${ev}END:VCALENDAR`).rows.length, 400)
  assert.equal(rowsOf(`BEGIN:VCALENDAR\n${ev.replace('DAILY', 'HOURLY')}END:VCALENDAR`).rows.length, 1)
  const many = Array.from({ length: 21_000 }, (_, i) => `BEGIN:VEVENT\nUID:u${i}\nDTSTART:20261107T100000Z\nSUMMARY:s\nEND:VEVENT\n`).join('')
  assert.throws(() => rowsOf(`BEGIN:VCALENDAR\n${many}END:VCALENDAR`), /too_large/)
})

Deno.test('SSRF: addresses and names a feed is never fetched from', () => {
  for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', 'ff02::1', '64:ff9b::a00:1', '999.1.1.1']) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip)
  }
  const prob = (u: string) => hostProblem(normalizeFeedUrl(u)!)
  for (const u of ['http://127.0.0.1/a.ics', 'https://localhost/a.ics', 'https://foo.localhost/a.ics', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://017700000001/', 'https://intranet/a.ics', 'https://printer.local/a.ics', 'https://db.internal/a.ics', 'http://[::ffff:127.0.0.1]/', 'http://10.1.1.1:8080/a.ics', 'webcal://192.168.0.2/cal.ics']) {
    assert.equal(prob(u), 'blocked', u)
  }
  for (const u of ['https://pray.ahmedelywa.com/api/prayer-times.ics?latitude=1', 'webcal://calendar.example.org/a.ics', 'http://93.184.216.34/a.ics', 'https://[2606:4700::1111]/a.ics']) {
    assert.equal(prob(u), null, u)
  }
})

Deno.test('the link: webcal is https; other schemes, passwords and junk are not links', () => {
  assert.equal(normalizeFeedUrl(' webcal://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.79&color=%23E91E63 ')!.href, 'https://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.79&color=%23E91E63')
  assert.equal(normalizeFeedUrl('WEBCALS://x.example/a.ics')!.protocol, 'https:')
  assert.equal(normalizeFeedUrl('http://x.example/a.ics')!.protocol, 'http:')
  for (const bad of ['', 'ftp://x.example/a.ics', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/calendar,BEGIN', 'https://user:pass@x.example/a.ics', 'not a url', 'https://x.example/a b.ics', 'gopher://x.example/', 'https://' + 'a'.repeat(3000) + '.example']) {
    assert.equal(normalizeFeedUrl(bad), null, bad)
  }
})

Deno.test('the plan: first sync inserts, second changes nothing, a changed feed updates and removes', () => {
  const { rows } = rowsOf(read('mixed.ics'), 'Africa/Cairo')
  const first = planIcsSync([], rows)
  assert.equal(first.insert.length, rows.length)
  const stored: StoredIcs[] = rows.map((r, i) => ({ id: `id${i}`, ...r, deleted_at: null }))
  const again = planIcsSync(stored, rows)
  assert.deepEqual([again.insert.length, again.update.length, again.remove.length], [0, 0, 0])
  // the feed renames one event, drops another and adds one; a recoloured subscription rewrites every row
  const changed = rows.filter((r) => r.title !== 'Floating dinner').map((r) => (r.title === 'Absolute alarm' ? { ...r, title: 'Renamed' } : r))
  changed.push({ ...rows[0], title: 'Brand new', external_ref: { ...rows[0].external_ref, id: 'sub1/new/' } })
  const p = planIcsSync(stored, changed)
  assert.deepEqual([p.insert.length, p.update.length, p.remove.length], [1, 1, 1])
  assert.equal(planIcsSync(stored, rows.map((r) => ({ ...r, color: '#112233' }))).update.length, rows.length)
  // a duplicate stored row of one kept goes; a row someone trashed is brought back
  const dup = planIcsSync([...stored, { ...stored[0], id: 'dup' }], rows)
  assert.deepEqual(dup.remove, ['dup'])
  assert.equal(planIcsSync([{ ...stored[0], deleted_at: '2026-11-06T00:00:00Z' }], [rows[0]]).update.length, 1)
})

Deno.test('reminders: a subscribed event rings from its VALARM (one rule for the sweep and the device planner); a Google one never does', () => {
  const { rows } = rowsOf(read('prayer-times.ics'))
  const asRows = rows.map((r, i) => ({ id: `r${i}`, ...r }))
  // Fajr of 1 Nov starts 02:42Z with a 5-minute alarm: it rings at 02:37Z, in this window and no other
  const due = eventRemindersDue(asRows, new Date('2026-11-01T02:30:00Z'), new Date('2026-11-01T02:40:00Z'), 'Africa/Cairo', between)
  assert.deepEqual(due.map((d) => [d.event.title, d.at.toISOString()]), [['الفجر', '2026-11-01T02:37:00.000Z']])
  assert.equal(eventRemindersDue(asRows, new Date('2026-11-01T02:38:00Z'), new Date('2026-11-01T02:41:00Z'), 'Africa/Cairo', between).length, 0)
  assert.equal(eventRemindersDue(asRows.map((r) => ({ ...r, source: 'gcal' as const })), new Date('2026-11-01T02:30:00Z'), new Date('2026-11-01T02:40:00Z'), 'Africa/Cairo', between).length, 0)
  // with the switch off no row has a remind_min, so nothing rings
  const off = rowsOf(read('prayer-times.ics'), 'Africa/Cairo', { useAlarms: false }).rows.map((r, i) => ({ id: `o${i}`, ...r }))
  assert.equal(eventRemindersDue(off, new Date('2026-11-01T02:30:00Z'), new Date('2026-11-01T02:40:00Z'), 'Africa/Cairo', between).length, 0)
})
