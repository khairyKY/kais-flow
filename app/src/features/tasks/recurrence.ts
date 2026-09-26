import { RRule } from 'rrule'

/**
 * Computes the next occurrence strictly after `fromDate` for a stored RRULE string
 * (e.g. "FREQ=MONTHLY"). Per RFC 5545, if a monthly rule's anchor day doesn't exist in a
 * given month (e.g. day 31 in February), that occurrence is skipped entirely — not clamped
 * to the month's last day. Returns null if the rule produces no further occurrences.
 */
export function nextOccurrence(recurrenceRule: string, fromDate: Date): Date | null {
  const options = RRule.parseString(recurrenceRule)
  const rule = new RRule({ ...options, dtstart: fromDate })
  return rule.after(fromDate, false)
}

/**
 * Polish F2a (2026-09-26 decision): a repeat's next occurrence keeps its reminder. The reminder
 * sits as far before the NEW due time as the original's sat before its own ("15 min before"
 * stays 15 min before; a reminder set after the due time keeps that too). No reminder → none.
 * The copy used to carry the original's already-past `reminder_at` and `reminder_sent: true`,
 * and the notify sweep (reminder_sent = false, reminder_at within the last 10 min) never fired it.
 */
export function nextReminderAt(reminderAt: string | null, fromDue: string, toDue: Date): string | null {
  if (!reminderAt) return null
  const lead = new Date(fromDue).getTime() - new Date(reminderAt).getTime()
  return new Date(toDue.getTime() - lead).toISOString()
}
