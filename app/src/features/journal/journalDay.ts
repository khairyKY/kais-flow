// Pure helpers for the D-1 journal model — one daily page, unlimited timestamped entries.
// Colocated + unit-tested, same convention as inbox/inboxDisplay.ts and tasks/taskDisplay.ts.
// TZ Africa/Cairo per house convention (store UTC, render Cairo).
import type { JournalEntry } from '../../lib/types'
import { appZone } from '../../lib/appZone'
import { clockOptions } from '../../lib/clock'

/** An empty row is a "+ New entry" the user never typed into. It must not count as a day
 * written, or the streak / Day-N / "kept" markers would lie (punch item 10). A photo is something
 * kept too: an entry with one counts even with no words. (What shows a line of TEXT — On this day,
 * the home-screen widget — reads `body` itself.) */
export function isWritten(e: JournalEntry): boolean {
  return e.body.trim().length > 0 || (e.media_paths?.length ?? 0) > 0
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

/** "Kept · N days of showing up": the days this month with something written, up to `today`.
 * Not a streak — Kai's Notebook rule: "A missed night is just a blank line. No catching up, no
 * reset." (Product audit 2026-10-12: the old consecutive-days streak went to 0 after one miss.) */
export function daysWrittenThisMonth(entries: JournalEntry[], today: string): number {
  const month = today.slice(0, 7)
  return new Set(entries.filter((e) => isWritten(e) && e.entry_date.startsWith(month) && e.entry_date <= today).map((e) => e.entry_date)).size
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
 *  - `away`: offline, and it never loaded on this device. Read from the connection as well as the
 *    query: the query says `paused`, but the outbox cancels it on the first write (writeRow's
 *    cancelQueries), after which it only says `idle`;
 *  - `resting`: the request failed and there's nothing cached.
 * Until the journal list is `ready`, nothing derived from it is claimed — "Day N", the first-page
 * line, the kept/empty markers, the streak, On this day. A cold offline load used to greet a
 * returning writer with "The first page is the hardest", "Day 1" and "0 days". The notebook stays
 * writable in every state: P0-B's `holdRow` keeps what's typed until the list catches up. */
export type ListState = 'ready' | 'loading' | 'away' | 'resting'
export function listState(q: { data: unknown; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle' }, online = true): ListState {
  if (q.data !== undefined) return 'ready'
  if (q.isError) return 'resting'
  if (q.fetchStatus === 'paused' || !online) return 'away'
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
  return new Date(iso).toLocaleTimeString('en-US', { ...clockOptions(), timeZone: appZone() })
}

// ── Talk it out + photos (the IO half is ./media.ts) ──

/** `<uid>/<entry>/<photo>.jpg` in the `journal` bucket — the first folder is the owner, which is what
 * the bucket's RLS checks (migration 0060). */
export function journalPhotoPath(uid: string, entryId: string, photoId: string): string {
  return `${uid}/${entryId}/${photoId}.jpg`
}

/** `path` added at the end — or back at index `at` (≥ 0), where a removal's Undo found it. */
export function addMedia(paths: string[] | null | undefined, path: string, at?: number): string[] {
  const list = paths ?? []
  if (list.includes(path)) return list
  const next = [...list]
  next.splice(at ?? list.length, 0, path)
  return next
}

export function removeMedia(paths: string[] | null | undefined, path: string): string[] {
  return (paths ?? []).filter((p) => p !== path)
}

/** Spoken words join the entry as their own paragraph (the command bar's dictation joins with a space;
 * a journal take is a thought of its own). Also accumulates `transcript` across takes. */
export function appendTranscript(body: string | null | undefined, heard: string): string {
  const a = (body ?? '').trimEnd()
  const b = heard.trim()
  return a && b ? `${a}\n\n${b}` : a || b
}
