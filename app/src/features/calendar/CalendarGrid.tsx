import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type DropArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg } from '@fullcalendar/core'
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

// This wrapper is the contract: callers never touch FullCalendar directly, so the underlying
// grid can be restyled or swapped for a hand-rolled one in the design phase without changes here.
interface CalendarGridProps {
  events: CalendarGridEvent[]
  dayCount?: number
  onCreate: (start: string, end: string) => void
  onMove: (id: string, start: string, end: string) => void
  onResize: (id: string, start: string, end: string) => void
  onEventClick: (id: string) => void
  onExternalDrop: (taskId: string, start: string, end: string) => void
  onEventContextMenu?: (eventId: string, x: number, y: number) => void
  conflictedIds?: string[]
}

export function CalendarGrid({
  events,
  dayCount = 7,
  onCreate,
  onMove,
  onResize,
  onEventClick,
  onExternalDrop,
  onEventContextMenu,
  conflictedIds,
}: CalendarGridProps) {
  const customView = 'customDayCount'
  return (
    <FullCalendar
      key={dayCount}
      plugins={[timeGridPlugin, interactionPlugin]}
      initialView={dayCount === 7 ? 'timeGridWeek' : customView}
      views={{
        [customView]: {
          type: 'timeGrid',
          duration: { days: dayCount },
          buttonText: `${dayCount}d`,
        },
      }}
      headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,' + (dayCount === 7 ? 'timeGridWeek' : customView) }}
      height="auto"
      dayHeaderContent={(arg) => (
        <div className="cal-day-header">
          <div className="cal-day-header-name">{arg.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
          <div className="cal-day-header-num">{arg.date.getDate()}</div>
        </div>
      )}
      nowIndicator
      selectable
      selectMirror
      editable
      droppable
      events={events.map((e) => {
        const classes = ['fc-event-type-' + e.type]
        if (e.linked) classes.push('fc-event-linked')
        if (conflictedIds?.includes(e.id)) classes.push('fc-event-conflict')
        const ev: Record<string, unknown> = { id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, classNames: classes }
        if (e.color) {
          ev.backgroundColor = e.color + '22'
          ev.borderColor = 'transparent'
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
        onCreate(info.startStr, info.endStr)
      }}
      eventClick={(info: EventClickArg) => onEventClick(info.event.id)}
      eventDrop={(info: EventDropArg) => {
        if (info.event.start && info.event.end) {
          onMove(info.event.id, info.event.start.toISOString(), info.event.end.toISOString())
        }
      }}
      eventResize={(info: EventResizeDoneArg) => {
        if (info.event.start && info.event.end) {
          onResize(info.event.id, info.event.start.toISOString(), info.event.end.toISOString())
        }
      }}
      drop={(info: DropArg) => {
        const taskId = info.draggedEl.dataset.taskId
        if (!taskId || !info.date) return
        const end = new Date(info.date.getTime() + 30 * 60 * 1000)
        onExternalDrop(taskId, info.date.toISOString(), end.toISOString())
      }}
    />
  )
}
