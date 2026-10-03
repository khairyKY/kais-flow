// Settings › Notifications › Ritual reminders: who gets the morning digest / evening nudge on a
// given cron tick. Pure — no Deno APIs — so app/src/features/notifications/ritual.test.ts runs it
// under the app's vitest (the _shared/github.ts pattern).
//
// pg_cron calls notify every TICK_MIN minutes with `scheduled: true` (migration 0045); a user's
// reminder is due on the first tick at or after their time, i.e. when it falls in (tick - 15, tick].

export type RitualKind = 'morning_digest' | 'evening_nudge'

/** The app_settings columns (0045). Absent/null = the column default — a user with no settings row
 * gets both reminders at the times the old fixed cron used. */
export interface RitualSettings {
  morning_digest_on?: boolean | null
  morning_digest_at?: string | null
  evening_nudge_on?: boolean | null
  evening_nudge_at?: string | null
}

export const TICK_MIN = 15
const DEFAULT_AT: Record<RitualKind, number> = { morning_digest: 8 * 60, evening_nudge: 21 * 60 } // 08:00 / 21:00, the 0045 column defaults

// ponytail: one zone for everyone — times are Cairo wall-clock. The per-user-timezone pass passes
// app_settings.timezone as `zone`; nothing else here changes.
export const RITUAL_ZONE = 'Africa/Cairo'

/** Minutes since midnight on `zone`'s wall clock. Intl knows DST, so 08:00 stays 08:00 all year
 * (on a DST-change night the skipped/doubled hour can skip or repeat one reminder). */
export function wallMinutes(now: Date, zone: string = RITUAL_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return n('hour') * 60 + n('minute')
}

/** "08:30" or Postgres's "08:30:00" → 510; null when it isn't a time. */
function minutesOf(hm: string | null | undefined): number | null {
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
