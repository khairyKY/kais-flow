import { dayWord } from '../inbox/inboxDisplay'

// Same clock as the Inbox's `formatDue` ("Sun 10:00 AM"): Cairo, hour + minutes, no seconds.
const cairoClock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' })

/** The command bar's date chip — "Tomorrow · 10:00 AM", "Wed, Oct 7 · 3:00 PM". The day word is
 * the Inbox filing toast's (`dayWord`: Today / Tomorrow / a real date, so a date weeks out is never
 * mistaken for this week's), the clock is `formatDue`'s. Both read Cairo on any device. */
export function formatDueChip(iso: string, now: Date = new Date()): string {
  return `${dayWord(iso, now)} · ${cairoClock.format(new Date(iso))}`
}
