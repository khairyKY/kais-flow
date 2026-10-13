// The weekly review's week — pure, so tests don't pull in the page (and the Supabase client).
import { cairoDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { appZone } from '../../lib/appZone'
import { weekendDays } from '../../lib/weekend'
import { loopNow } from './loopDay'

// The review week runs from the day after the user's weekend to the end of the next one, midnight
// to midnight on the user's clock (2026-10-12 review: it was the device's Sunday, whatever the
// weekend). Fri + Sat (Kai) → Sun–Sat, reviewed on Friday; Sat + Sun → Mon–Sun; no weekend → Sun.
function midnightOf(key: string, plusDays = 0): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(zoneWallTimeToIso(appZone(), y, m, d + plusDays))
}
/** The weekday a review week starts on: the day after the weekend's last day. */
export function weekStartDay(weekend: readonly number[]): number {
  const on = new Set(weekend)
  const last = [...on].find((d) => !on.has((d + 1) % 7))
  return last === undefined ? 0 : (last + 1) % 7
}
export function startOfWeek(now: Date, weekend: readonly number[] = weekendDays()): Date {
  const key = cairoDateKey(now)
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay()
  return midnightOf(key, -((weekday - weekStartDay(weekend) + 7) % 7))
}
/** A review event as the Weekly review and Today read it (activity_log rows, oldest first). */
export interface ReviewEvent {
  event_type: string
  payload: unknown
  created_at: string
}

/** When the review week starting `weekKey` was closed, or null while it's open. The latest close /
 * reopen for that week wins, so Undo on "Close the week" opens it again (A29). A row names its week
 * (`payload.week`: the week of the loop day it was written on, so a close at 00:30 after the review
 * day is that week's, not the next one's); a row without one counts for the week it was written in. */
export function weekClosedAt(rows: readonly ReviewEvent[], weekKey: string, weekend: readonly number[] = weekendDays()): string | null {
  let at: string | null = null
  for (const e of rows) {
    if (e.event_type !== 'review.week_closed' && e.event_type !== 'review.week_reopened') continue
    const week = (e.payload as { week?: string } | null)?.week ?? cairoDateKey(startOfWeek(loopNow(new Date(e.created_at)), weekend))
    if (week === weekKey) at = e.event_type === 'review.week_closed' ? e.created_at : null
  }
  return at
}

/** `n` days after a midnight on the user's clock — wall-clock days, so a DST week is still 7 days. */
export function addDays(d: Date, n: number): Date {
  return midnightOf(cairoDateKey(d), n)
}
