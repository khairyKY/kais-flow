// Today "Up next" row label (Polish D, 2026-09-26 audit: at 08:38 a 10:00 event read "Now").
//
// Today.dc.html 1a/1b: the block in progress reads "Now" in terra; every other row reads its
// start time in faint ink ("1:00 PM"). The old code gave "Now" to whichever event came FIRST
// today — a 10:00 meeting at 08:38, or a walk that ended at 07:30. Now it follows the clock.

const TZ = 'Africa/Cairo'

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
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

/** "Now" while the event is in progress, otherwise its start time. */
export function upNextLabel(startsAt: string, endsAt: string, now: Date): UpNextLabel {
  return isInProgress(startsAt, endsAt, now) ? { text: 'Now', tone: 'now' } : { text: upNextClock(startsAt), tone: 'time' }
}
