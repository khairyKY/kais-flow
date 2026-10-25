// One rule for how long a block is and where it sits, for all three kinds — a task's block, an event, a
// Time slot (Kai 2026-10-23: "duration doesn't sync with the times of scheduling"). Shared by the app
// (features/calendar/api, tasks/api, the rows and the task sheet) and the MCP server (mcp/tools.ts).
// - A new length moves the end and keeps the start.
// - A new end, or a resize from either edge, is a new length.
// - A move keeps the length.
// - A task with a block of its own: its duration_min, its scheduled times and the block are one thing.
// Pure: no app or Deno imports.

const MIN = 60_000

/** A timed span's length in whole minutes. */
export function spanMinutes(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / MIN)
}

/** A new length: the same start, the end `minutes` after it. */
export function withLength(startIso: string, minutes: number): { starts_at: string; ends_at: string } {
  return { starts_at: new Date(Date.parse(startIso)).toISOString(), ends_at: new Date(Date.parse(startIso) + minutes * MIN).toISOString() }
}

/** A day or more is days on the calendar (an all-day block, p7e A15), never a task's estimate. */
const DAY_MIN = 24 * 60

type TaskTimes = { due_at: string | null; scheduled_start: string | null; scheduled_end: string | null; duration_min: number | null }

/** A task's fields once its own block stands at [start, end): its scheduled times; its estimate is the
 * block's length (a timed block under a day); and a due time that WAS the block's time (due_at = its
 * old start: they were in step) moves with it, so the date chip and the block keep agreeing. */
export function taskOnBlock(task: TaskTimes, start: string, end: string, allDay = false): Partial<TaskTimes> {
  const patch: Partial<TaskTimes> = { scheduled_start: start, scheduled_end: end }
  const len = spanMinutes(start, end)
  if (!allDay && len > 0 && len < DAY_MIN && len !== task.duration_min) patch.duration_min = len
  if (!allDay && task.due_at && task.scheduled_start && Date.parse(task.due_at) === Date.parse(task.scheduled_start) && Date.parse(start) !== Date.parse(task.due_at)) patch.due_at = start
  return patch
}

type TaskShown = TaskTimes & { slot_id?: string | null }

/** The task's own block, read off its scheduled times — none for a task held in a Time slot (those
 * are the slot's times) or a block a day or longer. */
function ownBlock(task: TaskShown): { start: string; minutes: number } | null {
  if (task.slot_id || !task.scheduled_start || !task.scheduled_end) return null
  const minutes = spanMinutes(task.scheduled_start, task.scheduled_end)
  return minutes > 0 && minutes < DAY_MIN ? { start: task.scheduled_start, minutes } : null
}

/** The length a task's row, chip and sheet show: its block's when it has one, else its estimate. */
export function taskMinutes(task: TaskShown): number | null {
  return ownBlock(task)?.minutes ?? task.duration_min
}

/** When a task's date chip says it is: its block's start when it has one, else its due date. */
export function taskWhen(task: TaskShown): string | null {
  return ownBlock(task)?.start ?? task.due_at
}
