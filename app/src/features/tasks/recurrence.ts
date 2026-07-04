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
