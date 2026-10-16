import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'
import { formatDuration } from '../tasks/taskDisplay'
import { addDays } from '../../components/pickerMath'
import { zoneToIso } from './eventTime'
import { expandEvents } from './series'

// ── Time Slots (Kai 2026-10-13, parity audit B2 → a; migration 0073): a Time block HOLDS tasks, as
// Akiflow's slots do. A task in one has slot_id (the block's stored row — a repeating slot's series
// row) + slot_date (the occurrence's day) and the slot's own times; it has no task block. Pure — the
// writes are calendar/api's putInSlotWithUndo / outOfSlotWithUndo and the slot moves there. ──

type Slot = Pick<CalendarEvent, 'id' | 'starts_at' | 'ends_at' | 'seriesId'>
type Held = Pick<Task, 'slot_id' | 'slot_date' | 'scheduled_start' | 'deleted_at'>

/** The stored row a Time block on screen is: its series row for an occurrence, else itself. */
export const slotRow = (slot: Pick<CalendarEvent, 'id' | 'seriesId'>): string => slot.seriesId ?? slot.id

/** The occurrence's day on the user's clock — what tasks.slot_date names. */
export const slotDay = (slot: Pick<CalendarEvent, 'starts_at'>, zone: string = appZone()): string => zoneDateKey(new Date(slot.starts_at), zone)

/** Does this slot occurrence hold `t`? Its row and day, and the task still at a time inside it — a task
 * an old build replanned elsewhere (it never clears slot_id) isn't drawn in the slot it left. */
export function inSlot(t: Held, slot: Slot, zone: string = appZone()): boolean {
  if (!t.slot_id || t.deleted_at || t.slot_id !== slotRow(slot) || t.slot_date !== slotDay(slot, zone) || !t.scheduled_start) return false
  const at = Date.parse(t.scheduled_start)
  return at >= Date.parse(slot.starts_at) && at < Date.parse(slot.ends_at)
}

export const slotTasks = <T extends Held>(slot: Slot, tasks: readonly T[], zone: string = appZone()): T[] => tasks.filter((t) => inSlot(t, slot, zone))

/** The Time block a drop at `at` lands in: a timed one whose span holds it (the latest-starting one
 * when they overlap). `except`: the block being dragged. */
export function slotAt<E extends CalendarEvent>(events: readonly E[], at: string, except?: string): E | undefined {
  const t = Date.parse(at)
  return events
    .filter((e) => e.type === 'time_block' && !e.all_day && !e.deleted_at && e.id !== except && Date.parse(e.starts_at) <= t && t < Date.parse(e.ends_at))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))[0]
}

/** The Time block occurrence among `rows` (stored rows: a series expands) on `day`, the user's — where
 * a task held that day sits once a series edit has re-made the rows. */
export function occurrenceOn<E extends CalendarEvent>(rows: readonly E[], day: string, zone: string = appZone()): E | undefined {
  const slots = rows.filter((e) => e.type === 'time_block' && !e.all_day && !e.deleted_at)
  return expandEvents(slots, new Date(zoneToIso(day, '00:00', zone)), new Date(zoneToIso(addDays(day, 1), '00:00', zone)), zone).find((e) => slotDay(e, zone) === day)
}

/** What a task takes on going into a slot occurrence: the slot, its day, and its times. */
export function intoSlot(slot: Slot, zone: string = appZone()): Pick<Task, 'slot_id' | 'slot_date' | 'scheduled_start' | 'scheduled_end'> {
  return { slot_id: slotRow(slot), slot_date: slotDay(slot, zone), scheduled_start: slot.starts_at, scheduled_end: slot.ends_at }
}

/** Out of the slot: back to the rail, unscheduled. */
export const OUT_OF_SLOT = { slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null } as const

const mins = (m: number) => formatDuration(m).toLowerCase()

/** "2 tasks · 45m of 2h": how many it holds and their estimates (30 minutes when none, the rail's
 * default) against the slot's length. */
export function slotFill(slot: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, held: readonly Pick<Task, 'duration_min'>[]): string {
  const used = held.reduce((n, t) => n + (t.duration_min || 30), 0)
  const total = Math.round((Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60_000)
  return `${held.length} task${held.length === 1 ? '' : 's'} · ${mins(used)} of ${mins(total)}`
}

/** The Time blocks a task can go into without a drag (the task menu's "Into a slot…", the command
 * bar's `>`): today's and the next 7 days', each occurrence of a repeating one, not over yet,
 * soonest first. `rows`: the stored calendar rows. */
export function upcomingSlots(rows: readonly CalendarEvent[], now: Date = new Date(), zone: string = appZone()): CalendarEvent[] {
  const today = zoneDateKey(now, zone)
  const to = Date.parse(zoneToIso(addDays(today, 8), '00:00', zone))
  const slots = rows.filter((e) => e.type === 'time_block' && !e.all_day && !e.deleted_at)
  return expandEvents(slots, new Date(zoneToIso(today, '00:00', zone)), new Date(to), zone)
    .filter((e) => Date.parse(e.starts_at) < to && Date.parse(e.ends_at) > now.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}
