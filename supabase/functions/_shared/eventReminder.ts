// Per-event reminders (migration 0077, parity audit A12): which reminders come due in a window. ONE
// rule for both senders — notify's 5-minute sweep (Web Push) and the device planner
// (app/src/features/notifications/plan.ts: the Windows sweep, the Android schedule) — so they agree
// on every occurrence. Pure; rrule is handed in (`RuleBetween`), the series.ts pattern.
//
// `remind_min` is an offset (minutes before the start), so it follows a moved event and holds for
// every occurrence of a repeating series. Never a Google event (source 'gcal': read-only, and Kai
// didn't ask), never an all-day one (its start is a date in no zone, not a moment).
import { expandSeries, type RuleBetween, type SeriesRow } from './series.ts'

export interface RemindRow extends SeriesRow {
  source?: string | null
  remind_min?: number | null
}

/** 0077's check: at most a day before. */
const MAX_MIN = 1440

export interface DueEvent<E> {
  /** The occurrence (an expanded one carries `seriesId` and an id `<row id>::<start ISO>`). */
  event: E
  /** Its reminder moment: the start minus `remind_min`. */
  at: Date
}

/** The event reminders whose moment falls in (from, to] on `zone`'s clock — one per occurrence,
 * earliest first. */
export function eventRemindersDue<E extends RemindRow>(rows: readonly E[], from: Date, to: Date, zone: string, between: RuleBetween): DueEvent<E>[] {
  const asked = rows.filter((r) => r.remind_min != null && r.source !== 'gcal' && !r.all_day && !r.deleted_at)
  if (asked.length === 0) return []
  const lo = from.getTime()
  const hi = to.getTime()
  const out: DueEvent<E>[] = []
  // A start can sit up to MAX_MIN after its reminder: expand that far past the window.
  for (const e of expandSeries(asked, from, new Date(hi + MAX_MIN * 60_000 + 1), zone, between)) {
    const at = Date.parse(e.starts_at) - e.remind_min! * 60_000
    if (at > lo && at <= hi) out.push({ event: e, at: new Date(at) })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** The occurrence's stored row and its start, normalised — what a sent reminder is keyed by. */
export function reminderKey(e: Pick<RemindRow, 'id' | 'starts_at' | 'seriesId'>): { eventId: string; startsAt: string } {
  return { eventId: e.seriesId ?? e.id, startsAt: new Date(e.starts_at).toISOString() }
}
