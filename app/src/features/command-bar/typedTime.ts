import { durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { clockRange, clockText } from '../../lib/clock'
import { zoneTimeKey } from '../calendar/eventTime'
import { parseCommand, readDuration } from './parseCommand'

// Queue item 16 (Kai 2026-10-23): type a time, a length or a range wherever one is picked — "50m",
// "1h20", "1:45", "7:10 pm", "7–8:30", "noon", "in 2h". Read with the quick-add's own reader
// (./parseCommand: its length token, and chrono for the words); the clock digits are read here so an
// hour without am/pm can take the half of the day nearest the block (chrono would say 7 AM). Times
// are on the user's own clock (appZone), as minutes into the day. Pure apart from the zone.

/** What was typed: a new start (minutes into the day), a new length (minutes), or both. */
export type Typed = { start?: number; minutes?: number }
export type TypedRead = { ok: true; value: Typed } | { ok: false; why: string }

export interface TypedContext {
  /** What the field sets: a length only (an estimate), a time only, or either (default). */
  accepts?: 'length' | 'time' | 'both'
  /** The current start, minutes into the day: an hour typed without am/pm takes the half of the day
   * nearest it (now, when there's none). */
  anchor?: number | null
  /** The 24-hour clock: "7" is 07:00, never 7 PM. */
  hour24?: boolean
  now?: Date
}

const HELP = 'Try 7:10 pm, 7–8:30, 50m or in 2h'
const LENGTH_HELP = 'A length is like 50m, 1h20 or 1:45'
const DAY = 24 * 60

/** "7", "7:10", "7pm", "7:10 p.m.", "19:10", "at 7", "noon", "midnight" → minutes; `sure` false for
 * an hour 1–12 with no am/pm on the 12-hour clock (`m` is then its morning reading). */
function clock(text: string, hour24: boolean): { m: number; sure: boolean } | null {
  const t = text.trim().replace(/^at\s+/, '')
  if (t === 'noon') return { m: 12 * 60, sure: true }
  if (t === 'midnight') return { m: 0, sure: true }
  const c = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/.exec(t)
  if (!c) return null
  const h = Number(c[1])
  const min = Number(c[2] ?? 0)
  if (min > 59) return null
  if (c[3]) return h >= 1 && h <= 12 ? { m: (h % 12) * 60 + min + (c[3] === 'p' ? 720 : 0), sure: true } : null
  if (h > 23) return null
  // 13–23, 0 and a leading zero ("07:10") are the 24-hour clock whatever the setting.
  const sure = hour24 || h === 0 || h >= 13 || c[1].startsWith('0')
  return { m: sure ? h * 60 + min : (h % 12) * 60 + min, sure }
}

/** The reading of an unsure hour nearest `anchor` (a tie goes to the later one). */
function nearest(m: number, anchor: number): number {
  const dist = (x: number) => Math.min(Math.abs(x - anchor), DAY - Math.abs(x - anchor))
  return dist(m + 720) <= dist(m) ? m + 720 : m
}

/** A length on its own: the quick-add's token ("50m", "1h20", "90min"), or — in a field that only takes
 * a length — "1:45" and a bare number of minutes ("45"). */
function lengthOf(text: string, lengthOnly: boolean): number | null {
  const t = text.trim()
  const d = readDuration(t)
  if (d && d.index === 0 && d.length === t.length) return d.minutes
  if (!lengthOnly) return null
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (hm && Number(hm[2]) < 60) return Number(hm[1]) * 60 + Number(hm[2])
  return /^\d{1,4}$/.test(t) ? Number(t) : null
}

/** A single time: the clock digits, else chrono through the quick-add's reader ("half past 7"). */
function timeOf(text: string, ctx: Required<Omit<TypedContext, 'accepts'>>): number | null {
  const c = clock(text, ctx.hour24)
  if (c) return c.sure ? c.m : nearest(c.m, ctx.anchor)
  const p = parseCommand(text, [], [], { now: ctx.now, zone: 'cairo' })
  // ponytail: a date in the words ("tomorrow 3pm") is dropped — the field sets a time on its own day.
  return p.dueAt && p.dueTimed && !p.title.trim() ? toMin(zoneTimeKey(new Date(p.dueAt))) : null
}

const ok = (value: Typed): TypedRead => ({ ok: true, value })
const no = (why: string): TypedRead => ({ ok: false, why })

/** Reads what was typed; null for an empty field. */
export function readTyped(text: string, context: TypedContext = {}): TypedRead | null {
  const s = text.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')
  if (!s) return null
  const accepts = context.accepts ?? 'both'
  const now = context.now ?? new Date()
  const ctx = { now, hour24: !!context.hour24, anchor: context.anchor ?? toMin(zoneTimeKey(now)) }
  const sized = (minutes: number): TypedRead => (minutes <= 0 ? no('A length needs at least a minute') : minutes >= DAY ? no('Too long — under a day') : ok({ minutes }))

  const len = lengthOf(s, accepts === 'length')
  if (accepts === 'length') return len != null ? sized(len) : no(LENGTH_HELP)
  if (len != null) return accepts === 'time' ? no("That's a length — type a time like 7:10 pm") : sized(len)

  // "in 2h": that long from now.
  const rel = /^in (.+)$/.exec(s)
  const ahead = rel && lengthOf(rel[1], false)
  if (ahead != null) return ok({ start: toMin(zoneTimeKey(new Date(now.getTime() + ahead * 60_000))) })

  // "7–8:30", "11-1pm", "7pm to 8:30": an end without am/pm is the first after the start; a start
  // without one takes the end's half of the day (or the anchor's, when neither says).
  const range = /^(.+?) ?(?:-| to | until ) ?(.+)$/.exec(s)
  const a = range && clock(range[1], ctx.hour24)
  const b = range && clock(range[2], ctx.hour24)
  if (a && b) {
    if (accepts === 'time') return no('Just the start here — like 7:10 pm')
    let start = a.m
    if (!a.sure) start = b.sure ? (a.m + 720 < b.m ? a.m + 720 : a.m) : nearest(a.m, ctx.anchor)
    const end = b.sure ? b.m : b.m > start ? b.m : b.m + 720
    if (end <= start) return no('It ends before it starts')
    return ok({ start, minutes: end - start })
  }

  // A time and a length: "7pm 45m", "7pm for 45m".
  const d = readDuration(s)
  const rest = d ? (s.slice(0, d.index) + s.slice(d.index + d.length)).replace(/\bfor\b/, '').trim() : s
  const start = timeOf(rest, ctx)
  if (start == null) return no(d || /\d/.test(s) ? HELP : `Didn't catch “${text.trim()}” — ${HELP.toLowerCase()}`)
  if (!d) return ok({ start })
  if (accepts === 'time') return no('Just the start here — like 7:10 pm')
  const sizedLen = sized(d.minutes)
  return sizedLen.ok ? ok({ start, minutes: d.minutes }) : sizedLen
}

/** The whole picture once a read is applied to what's there now: the start (when the thing has one)
 * and the length — or why it can't be ("runs past midnight"). */
export function applyTyped(v: Typed, now: { start: number | null; minutes: number | null }): { start: number | null; minutes: number | null; why?: string } {
  const start = v.start ?? now.start
  const minutes = v.minutes ?? now.minutes
  if (start != null && minutes != null && start + minutes > DAY) return { start, minutes, why: 'That runs past midnight' }
  return { start, minutes }
}

/** What was understood, as the person reads times: "7:10–8:30 PM · 1h20", "7:10 PM", "50m". */
export function typedEcho(r: { start: number | null; minutes: number | null }, hour24?: boolean): string {
  if (r.start != null && r.minutes) return `${clockRange(fromMin(r.start), fromMin(r.start + r.minutes), hour24)} · ${durationLabel(r.minutes)}`
  if (r.start != null) return clockText(fromMin(r.start), hour24)
  return r.minutes ? durationLabel(r.minutes) : ''
}
