import { perZone } from '../../lib/appZone'
import { dayWord } from '../inbox/inboxDisplay'

// Same clock as the Inbox's `formatDue` ("Sun 10:00 AM"): the user's zone, hour + minutes, no seconds.
const clockFmt = perZone((timeZone) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }))

/** The command bar's date chip — "Tomorrow · 10:00 AM", "Wed, Oct 7 · 3:00 PM". The day word is
 * the Inbox filing toast's (`dayWord`: Today / Tomorrow / a real date, so a date weeks out is never
 * mistaken for this week's), the clock is `formatDue`'s. Both read the user's zone on any device. */
export function formatDueChip(iso: string, now: Date = new Date()): string {
  return `${dayWord(iso, now)} · ${clockFmt().format(new Date(iso))}`
}
