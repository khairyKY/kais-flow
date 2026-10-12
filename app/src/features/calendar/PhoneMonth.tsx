import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { CalendarEvent } from '../../lib/types'
import { allDayOn, dayBlocks, monthTitle } from './phoneGridMath'

// ── The phone's Month (parity with the desktop's M view). No phone frame exists for it: it is Calendar
// 3e's "month-view form" at phone size — a 52px cell can't hold a 16px pill with a title, so a cell
// is its date (the week strip's circle) and the dot row ("kind dot … then a dot row with +N"), three
// dots at most. A tap opens that day. ──

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function PhoneMonth({ days, month, today, events, dotOf, mondayFirst, onPick, onPage }: {
  /** monthGrid(): whole weeks around the month. */
  days: string[]
  /** Any day of the month shown ("2026-10-…"). */
  month: string
  today: string
  events: CalendarEvent[]
  /** A block's kind hue (CALENDAR.md §3, the grid's own `look`). */
  dotOf: (e: CalendarEvent) => string
  mondayFirst: boolean
  onPick: (day: string) => void
  onPage: (dir: 1 | -1) => void
}) {
  const ym = month.slice(0, 7)
  const head = mondayFirst ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS
  return (
    <div className="pc-month">
      <div className="pc-month-nav">
        <button type="button" className="kf-bs-icon" aria-label="Previous month" onClick={() => onPage(-1)}>
          <Icon name="chevright" size={20} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span className="pc-month-title">{monthTitle(month)}</span>
        <button type="button" className="kf-bs-icon" aria-label="Next month" onClick={() => onPage(1)}>
          <Icon name="chevright" size={20} />
        </button>
      </div>
      <div className="pc-month-wd" aria-hidden>
        {head.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="pc-month-grid" role="grid" aria-label={monthTitle(month)}>
        {days.map((d) => {
          const items = [...allDayOn(events, [d]), ...dayBlocks(events, d).map((b) => b.event)]
          const label = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={`pc-mcell${d.slice(0, 7) === ym ? '' : ' is-out'}`}
              data-today={d === today || undefined}
              aria-label={`${label}${items.length ? `, ${items.length} on the calendar` : ''}`}
              onClick={() => onPick(d)}
            >
              <span className="pc-day-n">{Number(d.slice(8))}</span>
              <span className="pc-mdots">
                {items.slice(0, 3).map((e) => (
                  <i key={e.id} style={{ '--pc-dot': dotOf(e) } as CSSProperties} />
                ))}
                {items.length > 3 && <span>+{items.length - 3}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
