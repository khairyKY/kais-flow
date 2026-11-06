// Calendar subscriptions by link (ics-subscribe, Kai 2026-11-06): any .ics feed on our grid, read-only — the way
// Google Calendar's "From URL" works, no Google account. The pure half of ics-sync (no Deno APIs, so the app's vitest
// and supabase/tests/ics.test.ts run it): the URL guard, the parser, the expansion of repeats, the plan.
//
// A subscription is a calendar_subscriptions row (0094). Its events are calendar_events rows with source 'ics' and
// external_ref {source:'ics', id:'<sub>/<uid>/<recurrence-id>', sub_id, uid, recurrence_id, calendar:<name>,
// calendar_id:<sub>, url?} — 0027's unique index dedupes them. A repeat arrives EXPANDED (one row per occurrence in
// the window, as google-sync's singleEvents): the feed is the truth, so there is no series row to edit.
//
// The parser is written here rather than taken from ical.js: ical.js resolves a TZID only through a VTIMEZONE in the
// feed, and the feed that started this (a prayer-times calendar) names `Africa/Cairo` with no VTIMEZONE at all. We
// need Unfold · Line · TZID by Intl · DATE · DATE-TIME · DURATION · RRULE/EXDATE/RDATE/RECURRENCE-ID · VALARM, and
// nothing else.
//
// ponytail: a TZID Intl doesn't know (Outlook's "W. Europe Standard Time") reads on the feed's own zone
// (X-WR-TIMEZONE) or, failing that, the person's. Upgrade path: a Windows → IANA table, or parse VTIMEZONE.
import { expandSeries, fromFloating, type RuleBetween } from './series.ts'

// ── limits ──────────────────────────────────────────────────────────────────────────────────────

export const ICS_PAST_DAYS = 60
export const ICS_AHEAD_DAYS = 400
/** A feed larger than this is refused (not truncated: a partial read must not delete the rest). */
export const ICS_MAX_BYTES = 5 * 1024 * 1024
export const ICS_TIMEOUT_MS = 15_000
export const ICS_MAX_REDIRECTS = 3
/** Rows one subscription may keep in the window; past it the feed is refused, not cut. */
export const ICS_MAX_ROWS = 20_000
export const ICS_MAX_SUBSCRIPTIONS = 20

const DAY = 86_400_000

export const icsWindow = (now: Date): { start: Date; end: Date } => ({
  start: new Date(now.getTime() - ICS_PAST_DAYS * DAY),
  end: new Date(now.getTime() + ICS_AHEAD_DAYS * DAY),
})

// ── the link: webcal → https, and what we never fetch (SSRF) ────────────────────────────────────

export type UrlProblem = 'bad_url' | 'blocked'

/** What a person pasted → the URL to fetch. webcal(s):// is https (http for plain webcal is upgraded: every real feed
 * answers https, and a private-network `http` is refused below either way). null: not a link we can read. */
export function normalizeFeedUrl(raw: string): URL | null {
  const s = raw.trim()
  if (!s || s.length > 2048 || /[\s\u0000-\u001f]/.test(s)) return null
  let u: URL
  try {
    u = new URL(s.replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  return u
}

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Whether an IP literal (v4 or v6, no brackets) is somewhere a feed must never be fetched from: loopback, private,
 * link-local (cloud metadata is 169.254.169.254), CGNAT, multicast, reserved, unspecified. */
export function isPrivateIp(ip: string): boolean {
  const m = V4.exec(ip)
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if ([a, b, c, Number(m[4])].some((n) => n > 255)) return true
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  }
  const v6 = ip.toLowerCase().replace(/%.*$/, '')
  if (!v6.includes(':')) return true // neither: don't guess
  // ::ffff:a.b.c.d and ::ffff:xxxx:xxxx (v4-mapped), and the NAT64 prefix: the v4 inside decides
  const mapped = /^(?:::ffff:|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(v6)
  if (mapped) {
    if (mapped[1]) return isPrivateIp(mapped[1])
    const hi = parseInt(mapped[2], 16)
    const lo = parseInt(mapped[3], 16)
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  if (/^[0:]+1?$/.test(v6)) return true // ::, ::1
  const first = parseInt(v6.split(':')[0] || '0', 16)
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || (first & 0xffc0) === 0xfec0 || v6.startsWith('2001:db8') || v6.startsWith('100::')
}

/** The checks that need no network: a plain hostname that is a name for "here", or an IP literal in a private range.
 * (The caller then resolves a name and runs `isPrivateIp` on what it answers.) */
export function hostProblem(u: URL): UrlProblem | null {
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host) return 'bad_url'
  if (host.includes(':') || V4.test(host)) return isPrivateIp(host) ? 'blocked' : null
  if (host === 'localhost' || /(^|\.)(localhost|local|internal|lan|home|corp|intranet|localdomain)$/.test(host) || !host.includes('.')) return 'blocked'
  return null
}

// ── the parser ──────────────────────────────────────────────────────────────────────────────────

interface Line {
  name: string
  params: Record<string, string>
  value: string
}

/** RFC 5545 §3.1: a line that starts with a space or tab continues the one before. */
export function unfold(text: string): string[] {
  const out: string[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length) out[out.length - 1] += raw.slice(1)
    else if (raw !== '') out.push(raw)
  }
  return out
}

export function parseLine(line: string): Line | null {
  let i = 0
  while (i < line.length && line[i] !== ';' && line[i] !== ':') i++
  if (i >= line.length) return null
  const name = line.slice(0, i).toUpperCase()
  const params: Record<string, string> = {}
  while (line[i] === ';') {
    const eq = line.indexOf('=', i)
    if (eq < 0) return null
    const key = line.slice(i + 1, eq).toUpperCase()
    let j = eq + 1
    let val: string
    if (line[j] === '"') {
      const close = line.indexOf('"', j + 1)
      if (close < 0) return null
      val = line.slice(j + 1, close)
      j = close + 1
      while (j < line.length && line[j] !== ';' && line[j] !== ':') j++ // `"a","b"`: the first
    } else {
      while (j < line.length && line[j] !== ';' && line[j] !== ':') j++
      val = line.slice(eq + 1, j)
    }
    params[key] = val
    i = j
  }
  if (line[i] !== ':') return null
  return { name, params, value: line.slice(i + 1) }
}

/** TEXT (§3.3.11): \n · \N → newline, \, \; \\ → the character. */
export const unescapeText = (s: string): string => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))

const validZone = (z: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

/** A TZID as an IANA zone Intl knows, or null. Also reads `/mozilla.org/20070129_1/Europe/Berlin`. */
export function ianaZone(tzid: string | undefined): string | null {
  if (!tzid) return null
  const t = tzid.trim()
  if (validZone(t)) return t
  const tail = /([A-Za-z_]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)$/.exec(t)?.[1]
  return tail && validZone(tail) ? tail : null
}

/** A date or date-time property read on a wall clock: `wall` is its fields read as UTC (floating); `zone` is the
 * clock they are on ('UTC' for a Z time). A DATE is `allDay`, in no zone — the app's all-day convention is UTC midnight. */
export interface When {
  allDay: boolean
  wall: number
  zone: string
}

const DT = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i

export function parseWhen(value: string, params: Record<string, string>, fallbackZone: string): When | null {
  const m = DT.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  if (m[4] === undefined || params.VALUE?.toUpperCase() === 'DATE') return { allDay: true, wall: Date.UTC(y, mo - 1, d), zone: 'UTC' }
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)]
  if (h > 24 || mi > 59 || s > 60) return null
  return { allDay: false, wall: Date.UTC(y, mo - 1, d, h, mi, s), zone: m[7] ? 'UTC' : (ianaZone(params.TZID) ?? fallbackZone) }
}

/** The instant a When names. */
export const instantOf = (w: When): number => (w.allDay ? w.wall : fromFloating(w.wall, w.zone))

/** DURATION / a relative TRIGGER (§3.3.6) → ms, signed. */
export function parseDuration(s: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s.trim())
  if (!m || (!m[2] && !m[3] && !m[4] && !m[5] && !m[6])) return null
  const ms = (Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * DAY + Number(m[4] ?? 0) * 3_600_000 + Number(m[5] ?? 0) * 60_000 + Number(m[6] ?? 0) * 1000
  return m[1] === '-' ? -ms : ms
}

type Trigger = { kind: 'rel'; ms: number; end: boolean } | { kind: 'abs'; at: number }

interface RawEvent {
  uid: string
  recurrenceId: When | null
  start: When | null
  end: When | null
  duration: number | null
  summary: string
  url: string | null
  cancelled: boolean
  free: boolean
  rrule: string | null
  exdates: When[]
  rdates: When[]
  alarm: Trigger | null
}

export interface ParsedFeed {
  /** X-WR-CALNAME, else NAME. */
  name: string | null
  /** A #RRGGBB the feed asks for (X-APPLE-CALENDAR-COLOR, COLOR, X-WR-CALCOLOR). */
  color: string | null
  events: RawEvent[]
  /** BEGIN:VEVENT blocks seen, usable or not. */
  seen: number
}

/** `#E91E63`, `#e91e63ff` (alpha dropped) or `E91E63` → `#E91E63`; anything else (a CSS name…) → null. */
export function hexColor(s: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec((s ?? '').trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** Whether `text` is a calendar at all (a feed URL that answers an HTML page is not). */
export const looksLikeIcs = (text: string): boolean => /^﻿?\s*BEGIN:VCALENDAR/i.test(text)

/** `zone`: the person's, for times with no zone of their own (floating times read on the viewer's clock, §3.3.12). */
export function parseFeed(text: string, zone: string): ParsedFeed {
  const feed: ParsedFeed = { name: null, color: null, events: [], seen: 0 }
  let tz: string | null = null
  const stack: string[] = []
  let cur: (RawEvent & { _dt: Line | null }) | null = null
  let alarm: Trigger | null = null
  const fallback = () => tz ?? zone

  for (const raw of unfold(text)) {
    const l = parseLine(raw)
    if (!l) continue
    if (l.name === 'BEGIN') {
      const kind = l.value.trim().toUpperCase()
      stack.push(kind)
      if (kind === 'VEVENT' && stack.length === 2) {
        feed.seen++
        cur = { uid: '', recurrenceId: null, start: null, end: null, duration: null, summary: '', url: null, cancelled: false, free: false, rrule: null, exdates: [], rdates: [], alarm: null, _dt: null }
      }
      if (kind === 'VALARM') alarm = null
      continue
    }
    if (l.name === 'END') {
      const kind = stack.pop()
      if (kind === 'VEVENT' && cur) {
        const { _dt, ...ev } = cur
        void _dt
        if (!ev.uid) ev.uid = `x-${ev.summary}|${ev.start?.wall ?? ''}`
        if (ev.start) feed.events.push(ev)
        cur = null
      }
      if (kind === 'VALARM' && cur && alarm && !cur.alarm) cur.alarm = alarm
      continue
    }
    const top = stack[stack.length - 1]
    if (top === 'VCALENDAR') {
      if (l.name === 'X-WR-CALNAME' || (l.name === 'NAME' && !feed.name)) feed.name = unescapeText(l.value).trim() || feed.name
      else if (l.name === 'X-WR-TIMEZONE' || l.name === 'TIMEZONE-ID') tz ??= ianaZone(l.value)
      else if (l.name === 'X-APPLE-CALENDAR-COLOR' || l.name === 'COLOR' || l.name === 'X-WR-CALCOLOR') feed.color ??= hexColor(l.value)
    } else if (top === 'VALARM' && stack[stack.length - 2] === 'VEVENT') {
      if (l.name === 'TRIGGER' && !alarm) {
        if (l.params.VALUE?.toUpperCase() === 'DATE-TIME') {
          const w = parseWhen(l.value, l.params, 'UTC')
          if (w && !w.allDay) alarm = { kind: 'abs', at: instantOf(w) }
        } else {
          const ms = parseDuration(l.value)
          if (ms !== null) alarm = { kind: 'rel', ms, end: l.params.RELATED?.toUpperCase() === 'END' }
        }
      }
    } else if (top === 'VEVENT' && cur) {
      switch (l.name) {
        case 'UID': cur.uid = l.value.trim(); break
        case 'SUMMARY': cur.summary = unescapeText(l.value).replace(/\s+/g, ' ').trim(); break
        case 'URL': cur.url = /^https:\/\//i.test(l.value.trim()) ? l.value.trim() : null; break
        case 'STATUS': cur.cancelled = l.value.trim().toUpperCase() === 'CANCELLED'; break
        case 'TRANSP': cur.free = l.value.trim().toUpperCase() === 'TRANSPARENT'; break
        case 'RRULE': cur.rrule ??= l.value.trim().replace(/^RRULE:/i, ''); break
        case 'DTSTART': cur.start = parseWhen(l.value, l.params, fallback()); break
        case 'DTEND': cur.end = parseWhen(l.value, l.params, fallback()); break
        case 'DURATION': cur.duration = parseDuration(l.value); break
        case 'RECURRENCE-ID': cur.recurrenceId = parseWhen(l.value, l.params, fallback()); break
        case 'EXDATE':
        case 'RDATE':
          for (const v of l.value.split(',')) {
            const w = parseWhen(v.includes('/') ? v.split('/')[0] : v, l.params, fallback())
            if (w) (l.name === 'EXDATE' ? cur.exdates : cur.rdates).push(w)
          }
          break
      }
    }
  }
  return feed
}

// ── rows ────────────────────────────────────────────────────────────────────────────────────────

export interface IcsRef {
  source: 'ics'
  /** '<sub id>/<uid>/<recurrence-id>' — 0027's unique key. */
  id: string
  sub_id: string
  uid: string
  /** The instance's own start (ISO) for a repeat's occurrence; '' for a one-off. */
  recurrence_id: string
  /** The subscription's name, and its id (the Google rows' calendar / calendar_id, so the menus read one shape). */
  calendar: string
  calendar_id: string
  url?: string
}

/** The columns a subscribed event writes. */
export interface IcsRow {
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  source: 'ics'
  busy: boolean
  type: 'event'
  color: string | null
  remind_min: number | null
  external_ref: IcsRef
}

export interface BuildOptions {
  subId: string
  name: string
  color: string | null
  /** The "Use the feed's reminders" switch. */
  useAlarms: boolean
  window: { start: Date; end: Date }
  between: RuleBetween
}

const iso = (ms: number) => new Date(ms).toISOString()

/** Minutes before the start an alarm rings, 0…1440 (0077's check), or null. */
export function remindMinutes(a: Trigger | null, startMs: number, endMs: number): number | null {
  if (!a) return null
  const before = a.kind === 'abs' ? startMs - a.at : a.end ? -(endMs - startMs + a.ms) : -a.ms
  if (before < 0) return null
  const min = Math.round(before / 60_000)
  return min <= 1440 ? min : null
}

/** Every event of a parsed feed that touches the window, as rows: repeats expanded, EXDATEs dropped, a
 * RECURRENCE-ID override replacing its instance (or removing it, when cancelled). Throws 'too_large' past
 * ICS_MAX_ROWS (the window of a feed that big isn't ours to hold). */
export function buildRows(feed: ParsedFeed, o: BuildOptions): IcsRow[] {
  const lo = o.window.start.getTime()
  const hi = o.window.end.getTime()
  const rows = new Map<string, IcsRow>()
  const masters = feed.events.filter((e) => !e.recurrenceId)
  const overrides = feed.events.filter((e) => e.recurrenceId)

  const put = (ev: RawEvent, uid: string, rid: string, start: When, startMs: number, endMs: number, alarmMin: number | null) => {
    if (!(startMs < hi && endMs > lo) && !(start.allDay && startMs < hi + DAY && endMs > lo - DAY)) return
    const id = `${o.subId}/${uid}/${rid}`
    const url = ev.url ?? undefined
    rows.set(id, {
      title: (ev.summary || 'Busy').slice(0, 500),
      starts_at: iso(startMs),
      ends_at: iso(endMs),
      all_day: start.allDay,
      source: 'ics',
      busy: !ev.free,
      type: 'event',
      color: o.color,
      remind_min: o.useAlarms && !start.allDay ? alarmMin : null,
      external_ref: { source: 'ics', id, sub_id: o.subId, uid, recurrence_id: rid, calendar: o.name, calendar_id: o.subId, ...(url ? { url } : null) },
    })
    if (rows.size > ICS_MAX_ROWS) throw new Error('too_large')
  }

  /** start, end of an event's first instance (ms), by DTEND, else DURATION, else the day / nothing. */
  const span = (ev: RawEvent): { s: number; e: number } | null => {
    if (!ev.start) return null
    const s = instantOf(ev.start)
    let e: number
    if (ev.end) e = instantOf(ev.end)
    else if (ev.duration !== null) e = s + (ev.start.allDay ? Math.max(DAY, ev.duration) : ev.duration)
    else e = ev.start.allDay ? s + DAY : s
    if (e < s) e = s
    if (ev.start.allDay && e === s) e = s + DAY
    return { s, e }
  }

  const overridden = new Set<string>() // `${uid}|${instance start ISO}`
  for (const ov of overrides) overridden.add(`${ov.uid}|${iso(instantOf(ov.recurrenceId!))}`)

  for (const ev of masters) {
    if (ev.cancelled) continue
    const sp = span(ev)
    if (!sp) continue
    const alarmMin = remindMinutes(ev.alarm, sp.s, sp.e)
    if (!ev.rrule && ev.rdates.length === 0) {
      put(ev, ev.uid, '', ev.start!, sp.s, sp.e, alarmMin)
      continue
    }
    const zone = ev.start!.zone
    const skip = ev.exdates.map((w) => iso(instantOf(w)))
    const starts: number[] = [sp.s]
    if (ev.rrule) {
      const base = { id: ev.uid, starts_at: iso(sp.s), ends_at: iso(sp.e), all_day: ev.start!.allDay, recurrence_rule: ev.rrule, recurrence_exdates: skip }
      // MINUTELY / HOURLY / SECONDLY would make a row per hour for 460 days: not a calendar's shape. The first only.
      if (/(^|;)FREQ=(SECONDLY|MINUTELY|HOURLY)(;|$)/i.test(ev.rrule)) base.recurrence_rule = ''
      const occ = expandSeries([base], new Date(lo), new Date(hi), zone, o.between)
      // a rule rrule couldn't read comes back as the row itself: one event
      starts.length = 0
      for (const x of occ) starts.push(Date.parse(x.starts_at))
      if (occ.length === 1 && !(occ[0] as { seriesId?: string }).seriesId) starts.splice(0, starts.length, sp.s)
    }
    for (const w of ev.rdates) starts.push(instantOf(w))
    const dur = sp.e - sp.s
    for (const s of new Set(starts)) {
      const key = iso(s)
      if (skip.includes(key) && !ev.rdates.some((w) => iso(instantOf(w)) === key)) continue
      if (overridden.has(`${ev.uid}|${key}`)) continue
      put(ev, ev.uid, key, ev.start!, s, s + dur, remindMinutes(ev.alarm, s, s + dur))
    }
  }

  for (const ov of overrides) {
    if (ov.cancelled) continue
    const sp = span(ov)
    if (!sp) continue
    put(ov, ov.uid, iso(instantOf(ov.recurrenceId!)), ov.start!, sp.s, sp.e, remindMinutes(ov.alarm, sp.s, sp.e))
  }
  return [...rows.values()].sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : a.external_ref.id < b.external_ref.id ? -1 : 1))
}

// ── the plan ────────────────────────────────────────────────────────────────────────────────────

/** A stored subscribed row, as much of it as the plan reads. */
export interface StoredIcs {
  id: string
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  busy: boolean
  color: string | null
  remind_min: number | null
  deleted_at: string | null
  external_ref: Partial<IcsRef> | null
}

export interface IcsPlan {
  insert: IcsRow[]
  update: { id: string; row: IcsRow }[]
  remove: string[]
}

const same = (s: StoredIcs, r: IcsRow): boolean =>
  !s.deleted_at && s.title === r.title && Date.parse(s.starts_at) === Date.parse(r.starts_at) && Date.parse(s.ends_at) === Date.parse(r.ends_at) &&
  s.all_day === r.all_day && s.busy === r.busy && s.color === r.color && (s.remind_min ?? null) === r.remind_min &&
  s.external_ref?.calendar === r.external_ref.calendar && s.external_ref?.url === r.external_ref.url

/**
 * What one sync writes for ONE subscription. `stored`: its rows. A stored row the feed no longer lists goes (deleted
 * in the feed, cancelled, moved out of the window — the feed is read in full, and only the window is kept). A row whose fields differ is rewritten as the feed says; a duplicate of one kept goes.
 */
export function planIcsSync(stored: readonly StoredIcs[], want: readonly IcsRow[]): IcsPlan {
  const wanted = new Map(want.map((r) => [r.external_ref.id, r]))
  const seen = new Set<string>()
  const plan: IcsPlan = { insert: [], update: [], remove: [] }
  for (const s of stored) {
    const key = s.external_ref?.id ?? ''
    const row = wanted.get(key)
    if (row && !seen.has(key)) {
      seen.add(key)
      if (!same(s, row)) plan.update.push({ id: s.id, row })
    } else plan.remove.push(s.id) // gone from the feed, a duplicate of one kept, or older than the window
  }
  for (const [key, row] of wanted) if (!seen.has(key)) plan.insert.push(row)
  return plan
}
