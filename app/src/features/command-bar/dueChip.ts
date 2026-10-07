import { perZone } from '../../lib/appZone'
import { dayWord } from '../inbox/inboxDisplay'

// Same clock as the Inbox's `formatDue` ("Sun 10:00 AM"): the user's zone, hour + minutes, no seconds.
const clockFmt = perZone((timeZone) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }))

/** The command bar's date chip — "Tomorrow · 10:00 AM", "Wed, Oct 7 · 3:00 PM". The day word is
 * the Inbox filing toast's (`dayWord`: Today / Tomorrow / a real date, so a date weeks out is never
 * mistaken for this week's), the clock is `formatDue`'s. Both read the user's zone on any device.
 * A date typed without a time is just the day ("Tomorrow"): only a typed time puts the capture on
 * the calendar (calendar/replan.ts), so the chip shows a clock only when there'll be a block. */
export function formatDueChip(iso: string, now: Date = new Date(), timed = true): string {
  return timed ? `${dayWord(iso, now)} · ${clockFmt().format(new Date(iso))}` : dayWord(iso, now)
}
