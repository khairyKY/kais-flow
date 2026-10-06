// Today "Up next" row label (Polish D, 2026-09-26 audit: at 08:38 a 10:00 event read "Now").
//
// Today.dc.html 1a/1b: the block in progress reads "Now" in terra; every other row reads its
// start time in faint ink ("1:00 PM"). The old code gave "Now" to whichever event came FIRST
// today — a 10:00 meeting at 08:38, or a walk that ended at 07:30. Now it follows the clock.

import { cairoDateKey } from '../../lib/dateShortcuts'
import { appZone } from '../../lib/appZone'

export type UpNextTone = 'now' | 'time'

export interface UpNextLabel {
  text: string
  tone: UpNextTone
}

/** In progress = started and not yet over: start ≤ now < end (an event ending at 11:00 is over at 11:00). */
export function isInProgress(startsAt: string, endsAt: string, now: Date): boolean {
  const t = now.getTime()
  return new Date(startsAt).getTime() <= t && t < new Date(endsAt).getTime()
}

/** The clock the row prints, in Cairo whatever the device zone (same format as the row's range). */
export function upNextClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: appZone() })
}

/** "Now" while the event is in progress, otherwise its start time. */
export function upNextLabel(startsAt: string, endsAt: string, now: Date): UpNextLabel {
  return isInProgress(startsAt, endsAt, now) ? { text: 'Now', tone: 'now' } : { text: upNextClock(startsAt), tone: 'time' }
}

/** The fields "Up next" reads from a calendar event. */
export interface UpNextEvent {
  starts_at: string
  ends_at: string
  all_day: boolean
}

/** Polish F2a (2026-09-26 decision "Up next = running + upcoming"): the timed events still worth a
 * glance — running now, or starting later today (Cairo). An event drops off the minute it ends
 * (end-exclusive, like isInProgress); one that began before today but is still running stays, as
 * "Now". All-day events aren't "next" (they have no time), so they never show. Sorted by start. */
export function upNextEvents<E extends UpNextEvent>(events: readonly E[], now: Date): E[] {
  const t = now.getTime()
  const today = cairoDateKey(now)
  return events
    .filter((e) => !e.all_day && new Date(e.ends_at).getTime() > t && (cairoDateKey(new Date(e.starts_at)) === today || isInProgress(e.starts_at, e.ends_at, now)))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}
