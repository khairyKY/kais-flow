// Settings › Notifications › Ritual reminders: who gets the morning digest / evening nudge on a
// given cron tick. Pure — no Deno APIs — so app/src/features/notifications/ritual.test.ts runs it
// under the app's vitest (the _shared/github.ts pattern).
//
// pg_cron calls notify every TICK_MIN minutes with `scheduled: true` (migration 0045); a user's
// reminder is due on the first tick at or after their time, i.e. when it falls in (tick - 15, tick].
import { DEFAULT_ZONE } from '../_shared/zone.ts'

export type RitualKind = 'morning_digest' | 'evening_nudge'

/** The app_settings columns (0045). Absent/null = the column default — a user with no settings row
 * gets both reminders at the times the old fixed cron used. */
export interface RitualSettings {
  morning_digest_on?: boolean | null
  morning_digest_at?: string | null
  evening_nudge_on?: boolean | null
  evening_nudge_at?: string | null
  /** The user's IANA zone (app_settings.timezone): every time here is wall-clock on it. */
  timezone?: string | null
}

export const TICK_MIN = 15
const DEFAULT_AT: Record<RitualKind, number> = { morning_digest: 8 * 60, evening_nudge: 21 * 60 } // 08:00 / 21:00, the 0045 column defaults

/** The default zone (no settings row, or a zone Intl doesn't know). notify passes each user's own
 * — `userZone(s.timezone)` — to everything below and to copy.ts. */
export const RITUAL_ZONE = DEFAULT_ZONE

/** Today on `zone`'s wall clock, as UTC instants [start, end) — the evening nudge's "today".
 * ponytail: midnight = now minus the wall-clock time of day; on a DST-change day it's an hour off. */
export function dayBounds(now: Date, zone: string = RITUAL_ZONE): { start: string; end: string } {
  const t = now.getTime()
  const start = t - wallMinutes(now, zone) * 60_000 - (t % 60_000)
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() }
}

/** Minutes since midnight on `zone`'s wall clock. Intl knows DST, so 08:00 stays 08:00 all year
 * (on a DST-change night the skipped/doubled hour can skip or repeat one reminder). */
export function wallMinutes(now: Date, zone: string = RITUAL_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return n('hour') * 60 + n('minute')
}

/** "08:30" or Postgres's "08:30:00" → 510; null when it isn't a time. */
export function minutesOf(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? '')
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function ritualOn(kind: RitualKind, s: RitualSettings | null | undefined): boolean {
  return s?.[`${kind}_on` as const] !== false
}

/** Is `kind` due for this user on the tick at `now`? */
export function ritualDue(kind: RitualKind, s: RitualSettings | null | undefined, now: Date, zone: string = RITUAL_ZONE): boolean {
  if (!ritualOn(kind, s)) return false
  const at = minutesOf(s?.[`${kind}_at` as const]) ?? DEFAULT_AT[kind]
  const since = (wallMinutes(now, zone) - at + 1440) % 1440 // minutes past the time, across midnight
  return since < TICK_MIN
}
