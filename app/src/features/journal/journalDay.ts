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

/** Rows the Journal page wrote that the cached list doesn't hold yet, keyed by id. */
export type HeldRows = Record<string, JournalEntry>

/** P0-B (audit 2026-09-26): when the journal list has never loaded on this device (offline, or
 * typing before the first fetch lands), writeRow has no cached list to add a new row to. The page
 * then couldn't see the entry it had just created, the blank page stayed blank, and every
 * keystroke started another entry — "Written while offline." became 22 one-letter rows. The page
 * holds its own latest copy of each row it writes until the cached list has that row. */
export function holdRow(held: HeldRows, row: JournalEntry, listed: JournalEntry[]): HeldRows {
  const inList = new Set(listed.map((e) => e.id))
  const next: HeldRows = {}
  // Rows the list has caught up with are the cache's again — it may have newer data.
  for (const [id, r] of Object.entries(held)) if (!inList.has(id)) next[id] = r
  if (!inList.has(row.id)) next[row.id] = row
  return next
}

/** The list the page renders: the cached list plus the held rows it doesn't have yet. A held row
 * that was deleted stays hidden, the same as the list's own `deleted_at` filter. */
export function withHeldRows(listed: JournalEntry[], held: HeldRows): JournalEntry[] {
  const inList = new Set(listed.map((e) => e.id))
  const extra = Object.values(held).filter((r) => !r.deleted_at && !inList.has(r.id))
  return extra.length ? [...listed, ...extra] : listed
}

/** Polish G (audit 2026-09-26): where a list the page reads from stands.
 *  - `ready`: it arrived (a later refetch failing doesn't un-arrive it);
 *  - `loading`: on its way;
 *  - `away`: offline, and it never loaded on this device (the query is paused);
 *  - `resting`: the request failed and there's nothing cached.
 * Until the journal list is `ready`, nothing derived from it is claimed — "Day N", the first-page
 * line, the kept/empty markers, the streak, On this day. A cold offline load used to greet a
 * returning writer with "The first page is the hardest", "Day 1" and "0 days". The notebook stays
 * writable in every state: P0-B's `holdRow` keeps what's typed until the list catches up. */
export type ListState = 'ready' | 'loading' | 'away' | 'resting'
export function listState(q: { data: unknown; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle' }): ListState {
  if (q.data !== undefined) return 'ready'
  if (q.isError) return 'resting'
  if (q.fetchStatus === 'paused') return 'away'
  return 'loading'
}

/** Said where the first-page line sits when the past couldn't be read. Never the word "error". */
export const PAST_AWAY = "Your earlier pages will be here when you're back online — what you write now is kept."
export const PAST_RESTING = "Your earlier pages didn't come through just now — what you write now is still kept."

/** "1 day" / "12 days" — the Kept count (audit #30 read "Kept 1 days"). */
export function daysLabel(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

/** Timestamp shown above each entry inside the notebook card. */
export function entryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
