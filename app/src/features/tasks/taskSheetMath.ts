// The phone task sheet's pure half (Task Sheet.dc.html 4a–4n, SCREENS-2026-09-28-sheets §Task sheet).
// Days and times are Cairo's (B2), like the pickers it opens.

import { RRule } from 'rrule'
import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'
import { cairoTimeKey } from '../calendar/eventTime'
import { addDays, busyOnDay, dayHint, dayShort, durationLabel, freeSlots, fromMin, toMin } from '../../components/pickerMath'
import { nextOccurrence } from './recurrence'
import { REPEAT_LABELS } from './taskMenuSpec'

/** How long "✓ Saved" shows after an edit before the line settles on "Edited HH:MM". */
export const SAVED_MS = 1500

/** "21 Sep" */
const dayMonth = (key: string) => dayShort(key).slice(4)

/** HH:MM when `at` is on today's Cairo date, else "21 Sep". */
function stamp(at: Date, now: Date): string {
  return cairoDateKey(at) === cairoDateKey(now) ? cairoTimeKey(at) : dayMonth(cairoDateKey(at))
}

export type SaveTone = 'pending' | 'saved' | 'quiet'

/** The footer's top line. Offline with the row still queued: "Pending sync". For SAVED_MS after this
 * sheet's own edit: "Saved". Then "Done 15:24" on a done task, else "Edited 15:02" (this sheet's last
 * edit, or the row's updated_at when that is later than its creation); nothing for an untouched task. */
export function saveLine(
  task: Pick<Task, 'created_at' | 'updated_at' | 'completed_at'>,
  savedAt: number | null,
  now: Date,
  pendingOffline: boolean,
): { tone: SaveTone; text: string } | null {
  if (pendingOffline) return { tone: 'pending', text: 'Pending sync' }
  if (savedAt != null && now.getTime() - savedAt < SAVED_MS) return { tone: 'saved', text: 'Saved' }
  if (task.completed_at) return { tone: 'quiet', text: `Done ${stamp(new Date(task.completed_at), now)}` }
  const updated = Date.parse(task.updated_at)
  const edited = Math.max(savedAt ?? 0, updated > Date.parse(task.created_at) ? updated : 0)
  return edited ? { tone: 'quiet', text: `Edited ${stamp(new Date(edited), now)}` } : null
}

/** "Created 21 Sep" */
export const createdLine = (createdAt: string) => `Created ${dayMonth(cairoDateKey(new Date(createdAt)))}`

/** "Done · Sun 27 · 15:24" — under a completed task's title. */
export function doneLine(completedAt: string, now: Date): string {
  const c = new Date(completedAt)
  return `Done · ${dayHint(cairoDateKey(c), cairoDateKey(now))} · ${cairoTimeKey(c)}`
}

/** "Today", "Tomorrow", else "Sun 27 Sep". */
export function dayWord(day: string, now: Date): string {
  const today = cairoDateKey(now)
  return day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : dayShort(day)
}

/** The date chip: "Today · 15:00", "Tomorrow · 09:00", else "Sun 27 Sep · 15:00". */
export function dueChip(dueIso: string, now: Date): string {
  const d = new Date(dueIso)
  return `${dayWord(cairoDateKey(d), now)} · ${cairoTimeKey(d)}`
}

/** The block card's line: "Sun 27 · 15:00–15:30 · 30m". */
export function blockLine(ev: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, now: Date): string {
  const s = new Date(ev.starts_at)
  const e = new Date(ev.ends_at)
  const min = Math.round((e.getTime() - s.getTime()) / 60_000)
  return `${dayHint(cairoDateKey(s), cairoDateKey(now))} · ${cairoTimeKey(s)}–${cairoTimeKey(e)} · ${durationLabel(min)}`
}

/** The Remind chip: "10m before", "1h before", "At due time" (the ⋯ Remind offsets); a reminder
 * with no due date, or one after it, reads as its own time. */
export function remindChip(reminderIso: string, dueIso: string | null): string {
  const min = dueIso ? Math.round((Date.parse(dueIso) - Date.parse(reminderIso)) / 60_000) : -1
  if (min < 0) return cairoTimeKey(new Date(reminderIso))
  return min === 0 ? 'At due time' : `${durationLabel(min)} before`
}

/** The Repeat chip: the ⋯ menu's names for its own rules, rrule's words for the rest ("Every weekday"). */
export function repeatLabel(rule: string): string {
  if (REPEAT_LABELS[rule]) return REPEAT_LABELS[rule]
  try {
    const text = RRule.fromString(rule).toText()
    return text.charAt(0).toUpperCase() + text.slice(1)
  } catch {
    return 'Repeats'
  }
}

/** "Next · Mon 28 Sep 15:00 · then Tue 29" — the next two dates, by the same rrule step that
 * completing the task uses (completion.ts), so the line says what "Done for today" will spawn. */
export function nextDates(rule: string, dueIso: string): string | null {
  const a = nextOccurrence(rule, new Date(dueIso))
  if (!a) return null
  const b = nextOccurrence(rule, a)
  const ka = cairoDateKey(a)
  return `Next · ${dayShort(ka)} ${cairoTimeKey(a)}${b ? ` · then ${dayHint(cairoDateKey(b), ka)}` : ''}`
}

export interface Suggestion {
  /** Cairo day the slots are on. */
  day: string
  /** Up to 3 start times, minutes into `day`. */
  starts: number[]
  /** Minutes into `day` the block must end by (the due time), or null. */
  before: number | null
}

/** Suggest a time (4m): up to 3 starts on the calendar's free time (pickerMath.freeSlots — 08:00–20:00,
 * not before now) that fit `dur` and end by the due time. The day is the due day when that is still
 * ahead, else today — and tomorrow when today has nothing left and no due time binds. Starts step
 * through each gap by the duration (on the quarter grid), so one long gap offers more than one. */
export function suggestTimes(events: readonly CalendarEvent[], dueIso: string | null, now: Date, dur: number): Suggestion {
  const today = cairoDateKey(now)
  const due = dueIso ? new Date(dueIso) : null
  const dueDay = due ? cairoDateKey(due) : null
  const day = dueDay && dueDay > today ? dueDay : today
  const before = due && due > now && dueDay === day ? toMin(cairoTimeKey(due)) : null
  const step = Math.max(15, Math.ceil(dur / 15) * 15)
  for (const d of before == null && day === today ? [day, addDays(day, 1)] : [day]) {
    const starts: number[] = []
    for (const gap of freeSlots(busyOnDay(events, d), d, now, dur, Infinity)) {
      const end = before == null ? gap.end : Math.min(gap.end, before)
      for (let t = gap.start; t + dur <= end && starts.length < 3; t += step) starts.push(t)
    }
    if (starts.length) return { day: d, starts, before }
  }
  return { day, starts: [], before }
}

/** The line under the slots: "Free before 15:00 · tap one to place it", or why there are none. */
export function suggestHint(s: Suggestion, now: Date): string {
  const by = s.before == null ? null : fromMin(s.before)
  if (!s.starts.length) return by ? `No free time before ${by}` : 'No free time today or tomorrow'
  // No due time binds only on today or its tomorrow fallback, so the word is "today" / "tomorrow".
  return `Free ${by ? `before ${by}` : dayWord(s.day, now).toLowerCase()} · tap one to place it`
}
