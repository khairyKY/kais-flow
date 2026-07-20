import { forwardRef, useImperativeHandle, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DropArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import './CalendarGrid.css'

export interface CalendarGridEvent {
  id: string
  title: string
  start: string
  end: string
  /** Task-linked blocks get a blush "from a task" edge treatment — see CalendarGrid.css. */
  linked?: boolean
  allDay?: boolean
  type: 'time_block' | 'event' | 'task'
  color?: string | null
}

export type CalendarGridView = 'timeGridDay' | 'customDayCount' | 'timeGridWeek' | 'dayGridMonth'

/** Imperative nav — the design's prev/today/next pills live in CalendarPage's own header,
 * not FullCalendar's built-in toolbar (hidden via `hideToolbar`), so they need a way to
 * reach the underlying Calendar API. */
export interface CalendarGridHandle {
  prev(): void
  next(): void
  today(): void
}

// This wrapper is the contract: callers never touch FullCalendar directly, so the underlying
// grid can be restyled or swapped for a hand-rolled one in the design phase without changes here.
interface CalendarGridProps {
  events: CalendarGridEvent[]
  dayCount?: number
  initialView?: CalendarGridView
  /** Hides FullCalendar's own toolbar — CalendarPage renders the botanical header instead. */
  hideToolbar?: boolean
  /** Fires on mount and after every nav/view change — drives CalendarPage's header title. */
  onRangeChange?: (info: { title: string; start: Date; end: Date }) => void
  onCreate: (info: { start: string; end: string; allDay: boolean; x: number; y: number }) => void
  onMove: (id: string, start: string, end: string) => void
  onResize: (id: string, start: string, end: string) => void
  onEventClick: (id: string) => void
  onExternalDrop: (taskId: string, start: string) => void
  onEventContextMenu?: (eventId: string, x: number, y: number) => void
  /** Right-click on empty grid space (not an existing event) — resolves the exact slot under the cursor. */
  onGridContextMenu?: (iso: string, allDay: boolean, x: number, y: number) => void
  conflictedIds?: string[]
  /** Effects 21 — id of an event just created by an external drop; its chip plays the settle-in. */
  justDroppedId?: string | null
}

/** FullCalendar renders the day-column grid and the time-slot guide lines as separate DOM
 * subtrees that only line up visually — elementsFromPoint sees both at a given pixel. */
function resolveGridDateTime(x: number, y: number): { iso: string; allDay: boolean } | null {
  const stack = document.elementsFromPoint(x, y)
  const dateEl = stack.find((el) => el.hasAttribute('data-date'))
  if (!dateEl) return null
  const [y0, mo, d] = dateEl.getAttribute('data-date')!.split('-').map(Number)
  const timeEl = stack.find((el) => el.hasAttribute('data-time'))
  const timeStr = timeEl?.getAttribute('data-time') ?? null
  if (!timeStr) return { iso: new Date(y0, mo - 1, d).toISOString(), allDay: true }
  const [hh, mm] = timeStr.split(':').map(Number)
  return { iso: new Date(y0, mo - 1, d, hh, mm).toISOString(), allDay: false }
}

function flashSnap(el: HTMLElement): void {
  el.classList.add('kf-snap-flash')
  window.setTimeout(() => el.classList.remove('kf-snap-flash'), 250)
}

export const CalendarGrid = forwardRef<CalendarGridHandle, CalendarGridProps>(function CalendarGrid({
  events,
  dayCount = 7,
  initialView = 'timeGridWeek',
  hideToolbar,
  onRangeChange,
  onCreate,
  onMove,
  onResize,
  onEventClick,
  onExternalDrop,
  onEventContextMenu,
  onGridContextMenu,
  conflictedIds,
  justDroppedId,
}, ref) {
  const customView = 'customDayCount'
  const fcRef = useRef<FullCalendar>(null)

  useImperativeHandle(ref, () => ({
    prev: () => fcRef.current?.getApi().prev(),
    next: () => fcRef.current?.getApi().next(),
    today: () => fcRef.current?.getApi().today(),
  }))

  function handleGridContextMenu(e: React.MouseEvent) {
    if (!onGridContextMenu) return
    const target = e.target as HTMLElement
    if (target.closest('.fc-event')) return
    const resolved = resolveGridDateTime(e.clientX, e.clientY)
    if (!resolved) return
    e.preventDefault()
    onGridContextMenu(resolved.iso, resolved.allDay, e.clientX, e.clientY)
  }

  return (
    <div onContextMenu={handleGridContextMenu} style={{ display: 'contents' }}>
    <FullCalendar
      key={`${initialView}-${dayCount}`}
      ref={fcRef}
      plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
      initialView={initialView}
      views={{
        [customView]: {
          type: 'timeGrid',
          duration: { days: dayCount },
          // dayCount defaults to 7, same span as Week — harmless, just a redundant button.
          buttonText: `${dayCount}d`,
        },
      }}
      headerToolbar={hideToolbar ? false : { left: 'prev,next today', center: 'title', right: `timeGridDay,${customView},timeGridWeek,dayGridMonth` }}
      datesSet={(arg: DatesSetArg) => onRangeChange?.({ title: arg.view.title, start: arg.view.currentStart, end: arg.view.currentEnd })}
      height="100%"
      scrollTime="08:00:00"
      // Motion 4c "Calendar drag dialect · snap": "30-min grid in the real view". Both were
      // relying on FullCalendar's defaults happening to be 30min — state the contract instead,
      // so the placeholder steps in half-hours and a drag can't land on an off-grid time.
      slotDuration="00:30:00"
      snapDuration="00:30:00"
      dayMaxEvents
      dayHeaderContent={(arg) => {
        // Month view's header row is one cell per weekday, not per date — the two-line
        // day-number header only makes sense in the timeGrid views.
        if (arg.view.type === 'dayGridMonth') {
          return <div className="cal-day-header cal-day-header-month">{arg.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        }
        return (
          <div className="cal-day-header">
            <div className="cal-day-header-name">{arg.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="cal-day-header-num">{arg.date.getDate()}</div>
          </div>
        )
      }}
      nowIndicator
      // Calendar.dc.html:213 — live mono time chip riding the now line; FC's NowTimer
      // re-renders this every minute, so no interval of our own.
      nowIndicatorContent={(arg) =>
        arg.isAxis ? null : (
          <span className="cal-now-chip">
            {arg.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )
      }
      selectable
      selectMirror
      editable
      droppable
      events={events.map((e) => {
        const classes = ['fc-event-type-' + e.type]
        if (e.linked) classes.push('fc-event-linked')
        if (conflictedIds?.includes(e.id)) classes.push('fc-event-conflict')
        if (e.id === justDroppedId) classes.push('kf-settle-in')
        const ev: Record<string, unknown> = { id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, classNames: classes }
        if (e.color) {
          // Calendar.dc.html:209-211 — colored events keep a ~20% tint fill AND the solid
          // accent left border in their color (CSS zeroes every other border width, so this
          // inline border-color paints only the 3px accent bar).
          ev.backgroundColor = e.color + '33'
          ev.borderColor = e.color
        }
        return ev
      })}
      eventDidMount={(info) => {
        if (!onEventContextMenu) return
        info.el.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault()
          onEventContextMenu(info.event.id, e.clientX, e.clientY)
        })
      }}
      select={(info) => {
        const jsEvent = info.jsEvent as MouseEvent | null
        onCreate({ start: info.startStr, end: info.endStr, allDay: info.allDay, x: jsEvent?.clientX ?? window.innerWidth / 2, y: jsEvent?.clientY ?? window.innerHeight / 2 })
      }}
      eventClick={(info: EventClickArg) => onEventClick(info.event.id)}
      eventDrop={(info: EventDropArg) => {
        // Motion 4c: the placeholder snaps to the grid on commit — a brief flash marks the moment,
        // scoped in CSS to `.cal-motion-on` so it's a no-op when the caller's motion gate is off.
        flashSnap(info.el)
        if (info.event.start && info.event.end) {
          onMove(info.event.id, info.event.start.toISOString(), info.event.end.toISOString())
        }
      }}
      // While resizing, FC keeps the original chip visible under the mirror — with both drawn
      // the overlap reads as a dark doubled rectangle. Hide the original for the duration.
      eventResizeStart={(info) => { info.el.style.visibility = 'hidden' }}
      eventResizeStop={(info) => { info.el.style.visibility = '' }}
      eventResize={(info: EventResizeDoneArg) => {
        flashSnap(info.el)
        if (info.event.start && info.event.end) {
          onResize(info.event.id, info.event.start.toISOString(), info.event.end.toISOString())
        }
      }}
      drop={(info: DropArg) => {
        const taskId = info.draggedEl.dataset.taskId
        if (!taskId || !info.date) return
        onExternalDrop(taskId, info.date.toISOString())
      }}
    />
    </div>
  )
})
