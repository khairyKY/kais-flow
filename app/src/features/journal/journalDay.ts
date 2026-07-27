// Pure helpers for the D-1 journal model — one daily page, unlimited timestamped entries.
// Colocated + unit-tested, same convention as inbox/inboxDisplay.ts and tasks/taskDisplay.ts.
// TZ Africa/Cairo per house convention (store UTC, render Cairo).
import type { JournalEntry } from '../../lib/types'

const TZ = 'Africa/Cairo'

/** An empty row is a "+ New entry" the user never typed into. It must not count as a day
 * written, or the streak / Day-N / "kept" markers would lie (punch item 10). */
export function isWritten(e: JournalEntry): boolean {
  return e.body.trim().length > 0
}

/** The day's entries in the order they were written. `created_at` is the entry's timestamp. */
export function entriesForDay(entries: JournalEntry[], date: string): JournalEntry[] {
  return entries
    .filter((e) => e.entry_date === date)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** Mood + the three small things are day-level, but live on a row. They sit on the day's
 * first entry; `find` rather than `[0]` so they survive a delete that happened before the
 * carry-forward write drained. */
export function dayField<K extends 'mood' | 'gratitude'>(
  dayEntries: JournalEntry[],
  key: K,
): JournalEntry[K] | null {
  const holder = dayEntries.find((e) => (key === 'mood' ? e.mood : e.gratitude.length > 0))
  return holder ? holder[key] : null
}

/** "Journal · Day N" — J7 in the drift audit: it used to be `entries.length`, which counted
 * entries and (post-D-1) would inflate every time you added a second one on the same day.
 * Honest reading: which numbered day of journaling is the page you're looking at. */
export function dayOrdinal(entries: JournalEntry[], date: string): number {
  const days = new Set(entries.filter((e) => isWritten(e) && e.entry_date <= date).map((e) => e.entry_date))
  days.add(date) // the page you're on is day N even before the first keystroke
  return days.size
}

/** Consecutive days with something actually written, ending today or yesterday. */
export function writtenStreak(entries: JournalEntry[], today: string): number {
  const days = new Set(entries.filter(isWritten).map((e) => e.entry_date))
  if (days.size === 0) return 0
  const cursor = new Date(`${today}T00:00:00Z`)
  if (!days.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0
  }
  let streak = 0
  for (;;) {
    const key = cursor.toISOString().slice(0, 10)
    if (!days.has(key)) return streak
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
}

/** Timestamp shown above each entry inside the notebook card. */
export function entryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
