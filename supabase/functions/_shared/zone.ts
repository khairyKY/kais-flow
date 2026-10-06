// User time zones (2026-10-04): each user's app_settings.timezone (an IANA name), Africa/Cairo by
// default — the column default, and every account before per-user zones. Pure — no Deno APIs — so
// the app's vitest runs it (app/src/features/notifications/userZone.test.ts).

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
