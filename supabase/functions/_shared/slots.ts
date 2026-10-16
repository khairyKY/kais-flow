// Time Slots (migration 0073): a Time block HOLDS tasks — a held task has slot_id (the block's stored
// row; a repeating one's series row), slot_date (that occurrence's day, the user's) and the slot's times.
// When an edit re-makes a slot's occurrences (a repeat set, changed or ended; a series re-timed), each
// held task goes to its day's occurrence of what the edit leaves, else out of the slot. This finds that
// occurrence, shared so the app (features/calendar/slots.ts → calendar/api reseat) and the MCP tools
// (mcp/tools.ts edit_event) re-home tasks the same way. Pure and dependency-free; rrule is handed in
// (series.ts RuleBetween), as for every expansion.
import { expandSeries, type RuleBetween, type SeriesRow } from './series.ts'
import { addDays, dateKey, wallToInstant } from './zone.ts'

export interface SlotRow extends SeriesRow {
  type?: string | null
}

/** The Time block occurrence among `rows` (stored rows: a series expands) on `day`, on `zone`'s clock —
 * where a task held that day sits once a series edit has re-made the rows. None: out of the slot. */
export function occurrenceOn<E extends SlotRow>(rows: readonly E[], day: string, zone: string, between: RuleBetween): E | undefined {
  const slots = rows.filter((e) => e.type === 'time_block' && !e.all_day && !e.deleted_at)
  return expandSeries(slots, wallToInstant(day, 0, 0, zone), wallToInstant(addDays(day, 1), 0, 0, zone), zone, between).find((e) => dateKey(new Date(e.starts_at), zone) === day)
}
