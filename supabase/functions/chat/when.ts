// The chat's day-and-time reader (queue item 5, 2026-10-25): the model copies the user's own words
// ("Mon 7:00–8:15", "Wed 5:45–7:00 PM", "tomorrow 9am") and this turns them into the MCP tools'
// wall-clock strings, so no weekday arithmetic is left to the model (it swapped Kai's gym days).
// Pure — no Deno APIs — so the app's vitest runs it (app/src/features/chat/when.test.ts).
//
// Rules:
//   a weekday     the coming one, never today ("Monday" on a Monday is next week's; "today" is today)
//   no day        today when the start is still ahead, else tomorrow (the next occurrence)
//   "26 Oct"      that date; this year, or next year once it has passed
//   a range       "5:45–7:00 PM": a meridiem on one end reads for both, unless that puts the start
//                 after the end ("11–1 PM" = 11 AM–1 PM); no meridiem = the 24-hour clock as written
//   "tonight 8"   an evening hour
//   past midnight an end before its start is the next day
//   "in 2 hours"  from now, to the next 5 minutes
import { addDays, dateKey, wallTime } from '../_shared/zone.ts'

/** 'YYYY-MM-DD' (a whole day) or 'YYYY-MM-DDTHH:mm' on the user's clock — what the MCP tools read. */
export interface Resolved {
  start: string
  end?: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAY = /\b(?:next\s+|this\s+|on\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/
const pad = (n: number) => String(n).padStart(2, '0')
const weekdayOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay()

interface Clock {
  h: number
  m: number
  mer: 'am' | 'pm' | null
}

const TIME = String.raw`(noon|midnight|\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)`

function readClock(s: string): Clock | null {
  if (s === 'noon') return { h: 12, m: 0, mer: null }
  if (s === 'midnight') return { h: 0, m: 0, mer: null }
  const t = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?/.exec(s.replace(/\./g, ''))
  if (!t) return null
  const h = Number(t[1])
  const m = t[2] ? Number(t[2]) : 0
  const mer = t[3] ? (t[3] === 'a' ? 'am' : 'pm') : null
  if (m > 59 || h > (mer ? 12 : 23) || (mer && h === 0)) return null
  return { h, m, mer }
}

/** Minutes after midnight, read with `mer` when the clock itself has none. */
const minutesOf = (c: Clock, mer: 'am' | 'pm' | null = c.mer): number => (mer ? (c.h % 12) + (mer === 'pm' ? 12 : 0) : c.h) * 60 + c.m

/** A range's two ends in minutes after midnight (the end may pass 24:00), or one start. */
function span(a: Clock, b: Clock | null): [number, number | null] {
  if (!b) return [minutesOf(a), null]
  let s: number
  let e: number
  if (a.mer && b.mer) [s, e] = [minutesOf(a), minutesOf(b)]
  else if (b.mer) {
    e = minutesOf(b)
    s = minutesOf(a, b.mer)
    if (s > e) s = minutesOf(a, b.mer === 'pm' ? 'am' : 'pm')
  } else if (a.mer) {
    s = minutesOf(a)
    e = minutesOf(b, a.mer)
    if (e <= s) e = minutesOf(b, a.mer === 'am' ? 'pm' : 'am')
  } else {
    s = minutesOf(a)
    e = minutesOf(b)
    if (e <= s && b.h < 12) e += 12 * 60 // "11–1" = 11:00–13:00
  }
  if (e <= s) e += 24 * 60
  return [s, e]
}

/** The day the words name (and the words left once it's read), or null when they name none. */
function readDay(text: string, today: string): { day: string; rest: string; evening?: boolean } | null {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)
  if (iso) return addDays(iso[1], 0) === iso[1] ? { day: iso[1], rest: text.replace(iso[0], ' ') } : null
  const rel = /\b(today|tonight|tomorrow|tmrw|tmr)\b/.exec(text)
  if (rel) return { day: rel[1] === 'today' || rel[1] === 'tonight' ? today : addDays(today, 1), rest: text.replace(rel[0], ' '), evening: rel[1] === 'tonight' }
  const wd = WEEKDAY.exec(text)
  if (wd) {
    const want = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wd[1].slice(0, 3))
    return { day: addDays(today, (want - weekdayOf(today) + 7) % 7 || 7), rest: text.replace(wd[0], ' ') } // the coming one, never today
  }
  const months = MONTHS.join('|')
  const dm = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${months})[a-z]*\.?(?:\s+(\d{4}))?\b`).exec(text)
  const md = new RegExp(String.raw`\b(${months})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b`).exec(text)
  const hit = dm ? { d: Number(dm[1]), mo: MONTHS.indexOf(dm[2]), y: dm[3], raw: dm[0] } : md ? { d: Number(md[2]), mo: MONTHS.indexOf(md[1]), y: md[3], raw: md[0] } : null
  if (!hit) return null
  const year = Number(today.slice(0, 4))
  const keyFor = (y: number) => `${y}-${pad(hit.mo + 1)}-${pad(hit.d)}`
  let key = keyFor(hit.y ? Number(hit.y) : year)
  if (addDays(key, 0) !== key) return null // 30 Feb
  if (!hit.y && key < today) key = keyFor(year + 1)
  return { day: key, rest: text.replace(hit.raw, ' ') }
}

/** The user's words for a day and/or a time, read on `zone`'s clock at `now` — null when they hold
 * neither, or a time that can't be (25:00). */
export function resolveWhen(words: string, now: Date, zone: string): Resolved | null {
  const raw = words.trim()
  // Already the tools' own shape: passed through.
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?$/.test(raw)) return { start: raw.replace(' ', 'T') }
  const text = ` ${raw.toLowerCase().replace(/[–—]|\bto\b|\buntil\b|\btill\b/g, '-').replace(/,/g, ' ')} `
  const wall = wallTime(now.toISOString(), zone) // "YYYY-MM-DD HH:mm"
  const today = wall.slice(0, 10)
  const nowMin = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))
  const rel = /\bin\s+(\d{1,3})\s*(h|hrs?|hours?|m|mins?|minutes?)\b/.exec(text)
  if (rel) {
    const at = new Date(Math.ceil((now.getTime() + Number(rel[1]) * (rel[2].startsWith('h') ? 3_600_000 : 60_000)) / 300_000) * 300_000)
    return { start: wallTime(at.toISOString(), zone).replace(' ', 'T') }
  }
  const dayHit = readDay(text, today)
  const rest = (dayHit?.rest ?? text).replace(/\b(at|from|on|by|around)\b/g, ' ')
  const range = new RegExp(String.raw`${TIME}\s*-\s*${TIME}`).exec(rest)
  const single = range ? null : new RegExp(String.raw`(?:^|\s)${TIME}(?=\s|$)`).exec(rest)
  let a = range ? readClock(range[1]) : single ? readClock(single[1]) : null
  const b = range ? readClock(range[2]) : null
  if ((range && (!a || !b)) || (single && !a)) return null
  if (!a) return dayHit ? { start: dayHit.day } : null
  if (dayHit?.evening && !a.mer && !b?.mer && a.h < 12) a = { ...a, mer: 'pm' }
  const [s, e] = span(a, b)
  const day = dayHit?.day ?? (s > nowMin ? today : addDays(today, 1))
  const at = (min: number) => `${addDays(day, Math.floor(min / 1440))}T${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`
  return e === null ? { start: at(s) } : { start: at(s), end: at(e) }
}

/** The calendar the model reads days from: "Sun 25 Oct (today) = 2026-10-25, Mon 26 Oct = …" — two weeks. */
export function dayTable(now: Date, zone: string, days = 14): string {
  const today = dateKey(now, zone)
  const name = (key: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${key}T12:00:00Z`))
  return Array.from({ length: days }, (_, i) => addDays(today, i))
    .map((k, i) => `${name(k)}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''} = ${k}`)
    .join(', ')
}
