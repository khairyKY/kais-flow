import { dayWord } from '../inbox/inboxDisplay'
import { timeText } from '../calendar/eventTime'

// Same clock as the Inbox's `formatDue`: the user's zone, hour + minutes, on the person's clock (lib/clock).

/** The command bar's date chip — "Tomorrow · 10:00 AM", "Wed, Oct 7 · 3:00 PM". The day word is
 * the Inbox filing toast's (`dayWord`: Today / Tomorrow / a real date, so a date weeks out is never
 * mistaken for this week's), the clock is `formatDue`'s. Both read the user's zone on any device.
 * A date typed without a time is just the day ("Tomorrow"): only a typed time puts the capture on
 * the calendar (calendar/replan.ts), so the chip shows a clock only when there'll be a block. */
export function formatDueChip(iso: string, now: Date = new Date(), timed = true): string {
  return timed ? `${dayWord(iso, now)} · ${timeText(new Date(iso))}` : dayWord(iso, now)
}
