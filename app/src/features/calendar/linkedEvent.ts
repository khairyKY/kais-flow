import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { CalendarEvent } from '../../lib/types'
import { rowIdOf } from '../../../../supabase/functions/_shared/series.ts'
import { expandEvents } from './series'

const YEAR = 366 * 86_400_000

/** The block a link names among the stored `rows`: a one-off as stored; a repeating event's own
 * occurrence (`<row id>::<start>`), or — a bare row id, a search hit — its next one from `now`. */
export function linkedBlock(rows: readonly CalendarEvent[], id: string, now: Date): CalendarEvent | undefined {
  const row = rows.find((e) => e.id === rowIdOf(id))
  if (!row?.recurrence_rule) return row
  const at = id.includes('::') ? Date.parse(id.slice(id.indexOf('::') + 2)) : NaN
  const from = Number.isNaN(at) ? now.getTime() : at
  return expandEvents([row], new Date(from), new Date(from + YEAR)).find((e) => Number.isNaN(at) || e.id === id) ?? row
}

/** /calendar?event=<id> — a search hit for an event (Kai 2026-10-06: it opened this week, wherever
 * the event was). `event` while the address names it; `open` only on the render it first becomes
 * known, so the page turns to it and opens it once and the reader is free after that. Reads the
 * stored rows (useCalendarRows): a search names a series by its row. */
export function useLinkedEvent(rows: CalendarEvent[]): { event?: CalendarEvent; open?: CalendarEvent } {
  const id = useSearchParams()[0].get('event')
  const [shown, setShown] = useState<string | null>(null)
  const event = id ? linkedBlock(rows, id, new Date()) : undefined
  if (event && shown !== id) {
    setShown(id)
    return { event, open: event }
  }
  return { event }
}
