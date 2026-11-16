// F7 · multi-day events on Today — "Trip · day 2 of 4". A span (all-day over two or more dates, or timed for a day or more)
// that covers today, one line each. Today draws no all-day events at all (the Now card and Up next are timed), so a span
// has nowhere else to show; a one-day all-day event stays off it, as before.

import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { dayNumber, isMultiDaySpan, spanDays } from '../calendar/daySpans'

export interface SpanToday {
  id: string
  title: string
  /** "day 2 of 4" */
  text: string
  color: string | null
}

type Row = Pick<CalendarEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'color'> & { deleted_at?: string | null }

/** The spans covering `now`'s day on the user's zone, soonest start first. */
export function spansToday(events: readonly Row[], now: Date, zone: string = appZone()): SpanToday[] {
  const today = zoneDateKey(now, zone)
  return events
    .filter((e) => !e.deleted_at && isMultiDaySpan(e, zone) && spanDays(e, zone).first <= today && today <= spanDays(e, zone).last)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((e) => {
      const { n, of } = dayNumber(e, today, zone)
      return { id: e.id, title: e.title, text: `day ${n} of ${of}`, color: e.color ?? null }
    })
}
