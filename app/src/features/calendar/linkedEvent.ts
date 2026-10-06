import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { CalendarEvent } from '../../lib/types'

/** /calendar?event=<id> — a search hit for an event (Kai 2026-10-06: it opened this week, wherever
 * the event was). `event` while the address names it; `open` only on the render it first becomes
 * known, so the page turns to it and opens it once and the reader is free after that. */
export function useLinkedEvent(events: CalendarEvent[]): { event?: CalendarEvent; open?: CalendarEvent } {
  const id = useSearchParams()[0].get('event')
  const [shown, setShown] = useState<string | null>(null)
  const event = id ? events.find((e) => e.id === id) : undefined
  if (event && shown !== event.id) {
    setShown(event.id)
    return { event, open: event }
  }
  return { event }
}
