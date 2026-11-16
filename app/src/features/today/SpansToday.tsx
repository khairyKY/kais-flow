import { EmojiText } from '../../components/EmojiText'
import type { CalendarEvent } from '../../lib/types'
import { spansToday } from './spanLines'

/** F7: the multi-day events covering today, one plain line each — "Trip · day 2 of 4". Today draws no all-day events
 * (Now and Up next are timed), so a trip or a conference would otherwise be nowhere on it. Nothing when none cover today. */
export function SpansToday({ events, now }: { events: readonly CalendarEvent[]; now: Date }) {
  const rows = spansToday(events, now)
  if (!rows.length) return null
  return (
    <div className="td-spans" role="list" aria-label="Happening over several days">
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="td-span">
          <span className="td-span-title" dir="auto"><EmojiText text={r.title} /></span>
          <span className="td-span-meta">{r.text}</span>
        </div>
      ))}
    </div>
  )
}
