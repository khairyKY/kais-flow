// Kai 2026-10-03: a reminder keeps its lead time when its task moves — "10 min before" set on a task
// due at 15:00 is still 10 min before after Tomorrow / a picked date / a calendar drag, instead of
// staying at today's 14:50 (the Task sheet's Remind chip used to read "18h10 before").

interface ReminderRow {
  due_at: string | null
  scheduled_start: string | null
  reminder_at: string | null
  reminder_sent: boolean
}

/** `next` with its reminder shifted by however far the task's anchor (due, else start) moved since
 * `prev`. Untouched when there's no reminder, when this write sets the reminder itself, or when
 * either anchor is missing. A reminder moved into the future is armed again. */
export function carryReminder<T extends ReminderRow>(prev: T | undefined, next: T, now = Date.now()): T {
  if (!prev?.reminder_at || next.reminder_at !== prev.reminder_at) return next
  const from = prev.due_at ?? prev.scheduled_start
  const to = next.due_at ?? next.scheduled_start
  if (!from || !to || from === to) return next
  const at = Date.parse(prev.reminder_at) + (Date.parse(to) - Date.parse(from))
  return { ...next, reminder_at: new Date(at).toISOString(), reminder_sent: at > now ? false : next.reminder_sent }
}
