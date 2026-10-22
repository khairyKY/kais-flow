// Snooze (Kai 2026-10-17, "build snooze"): Akiflow / Gmail's — a task leaves Today, the task lists and
// the calendar rail until `snoozed_until`, then comes back on its own. Its due date, calendar block and
// Top 3 rule are untouched: snooze hides, it doesn't replan (top3Rule gives a pick's place up, as any
// move off today does). Pure — every list reads these, and so do the tests (all four CI zones).
import { cairoDateKey } from '../../lib/dateShortcuts'
import { addDays, dayShort } from '../../components/pickerMath'
import { timeText } from '../calendar/eventTime'

type Snoozable = { snoozed_until?: string | null }

/** Hidden until later: `snoozed_until` is still ahead. */
export function isSnoozed(t: Snoozable, now: Date = new Date()): boolean {
  return !!t.snoozed_until && Date.parse(t.snoozed_until) > now.getTime()
}

/** Back from a snooze today (the user's day), still open — the "Back from snooze" marker, and its place
 * at the top of Today. ponytail: shown for the rest of that day, no "seen" state to keep. */
export function backFromSnooze(t: Snoozable & { completed_at?: string | null }, now: Date = new Date()): boolean {
  return !!t.snoozed_until && !t.completed_at && !isSnoozed(t, now) && cairoDateKey(new Date(t.snoozed_until)) === cairoDateKey(now)
}

/** When it comes back: "15:00" today, else "Tomorrow · 09:00" / "Mon 19 Oct · 09:00" (the date chip's words). */
export function snoozeWhen(untilIso: string, now: Date = new Date()): string {
  const at = new Date(untilIso)
  const [day, today] = [cairoDateKey(at), cairoDateKey(now)]
  if (day === today) return timeText(at)
  return `${day === addDays(today, 1) ? 'Tomorrow' : dayShort(day)} · ${timeText(at)}`
}

/** The toast: "Snoozed until 15:00" / "3 tasks snoozed until Tomorrow · 09:00". */
export function snoozeLine(untilIso: string, count: number, now: Date = new Date()): string {
  return `${count > 1 ? `${count} tasks snoozed` : 'Snoozed'} until ${snoozeWhen(untilIso, now)}`
}
