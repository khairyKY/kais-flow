// User time zones (2026-10-04): each user's app_settings.timezone (an IANA name), Africa/Cairo by
// default — the column default, and every account before per-user zones. Pure — no Deno APIs — so
// the app's vitest runs it (app/src/features/notifications/userZone.test.ts).
//
// The day math below (2026-10-12) moved here from mcp/tools.ts so notify, chat and mcp share one
// "what day is it on the user's clock" — DST included (a day is not always 24 hours).

export const DEFAULT_ZONE = 'Africa/Cairo'

/** A stored zone when Intl knows it, else the default (a typo must never break a cron run). */
export function userZone(tz: string | null | undefined): string {
  const z = tz?.trim()
  if (!z) return DEFAULT_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return z
  } catch {
    return DEFAULT_ZONE
  }
}

/** "Saturday 3 October 2026, 21:00 (America/New_York, GMT-04:00)" — the user's own "now", for a
 * model that has to read "tomorrow 3pm" on their clock and answer in UTC. */
export function wallClock(at: Date, tz: string): string {
  const zone = userZone(tz)
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  return `${local} (${zone}, ${offset})`
}

// ── day math on a zone's wall clock ──────────────────────────────────────────────────────────

const clocks = new Map<string, Intl.DateTimeFormat>()
function wall(t: number, zone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  let f = clocks.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    clocks.set(zone, f)
  }
  const p: Record<string, number> = {}
  for (const { type, value } of f.formatToParts(t)) p[type] = Number(value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second }
}

/** `zone`'s UTC offset in ms at instant `t`. */
function offsetMs(t: number, zone: string): number {
  const w = wall(t, zone)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD of the day `t` falls on, on `zone`'s calendar. */
export function dateKey(t: Date, zone: string): string {
  const w = wall(t.getTime(), zone)
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`
}

/** "YYYY-MM-DD HH:mm" on `zone`'s wall clock. */
export function wallTime(iso: string, zone: string): string {
  const w = wall(new Date(iso).getTime(), zone)
  return `${w.y}-${pad(w.m)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`
}

/** The instant `hour:minute` on day `key` names on `zone`'s wall clock. Two passes, because the offset
 * at the first guess can differ across a DST switch; midnight that DST skips (Cairo, spring) resolves
 * to the day's first real instant, 01:00. */
export function wallToInstant(key: string, hour: number, minute: number, zone: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  return new Date(guess - offsetMs(guess - offsetMs(guess, zone), zone))
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Today on the user's clock: its date and the [start, end) instants. */
export function dayWindow(now: Date, zone: string): { date: string; start: Date; end: Date } {
  const date = dateKey(now, zone)
  return { date, start: wallToInstant(date, 0, 0, zone), end: wallToInstant(addDays(date, 1), 0, 0, zone) }
}
