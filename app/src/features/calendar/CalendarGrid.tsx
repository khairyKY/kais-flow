import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DropArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { EmojiText } from '../../components/EmojiText'
import { dragGuard } from './dragGuard'
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
  /** Set when the block came from a task — drives the in-block checkbox (R4, 2026-07-20). */
  taskId?: string | null
  taskDone?: boolean
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
  /** Toggles the task behind a block from its checkbox. `done` is the state it was just in. */
  onCompleteTask?: (taskId: string, done: boolean) => void
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

/** 4c's resize snap line: the grid line the handle just committed to, flashed once. */
function flashSnapLine(el: HTMLElement): void {
  const parent = el.parentElement
  if (!parent) return
  const line = document.createElement('div')
  line.className = 'kf-cal-snapline'
  line.style.top = `${el.offsetTop + el.offsetHeight}px`
  parent.appendChild(line)
  window.setTimeout(() => line.remove(), 340)
}

// Motion 4c — "the ghost floats free, the placeholder snaps to the grid". FullCalendar only
// draws ONE dragging element and it snaps, so the free half of the dialect didn't exist. This
// mints a real ghost that tracks the pointer continuously; FC's own mirror is restyled (CSS,
// .fc-event-mirror) into the stepped placeholder it's supposed to be.
const GHOST_ID = 'kf-cal-ghost'

function startGhost(source: HTMLElement, ev: MouseEvent | null): () => void {
  if (typeof document === 'undefined') return () => {}
  const rect = source.getBoundingClientRect()

  // The ghost lives on <body> so `position: fixed` is always viewport-relative (a transformed
  // ancestor inside the grid would otherwise become its containing block — the mispositioning
  // bug the 2026-07-19 audit already paid for once). But every block rule is scoped `.fc ...`,
  // so a bare clone on <body> matched none of them and fell back to FullCalendar's own unscoped
  // `.fc-v-event`, whose --fc-event-bg-color defaults to #3788d8 — Kai's "it turns all blue".
  // Wrapping the clone in a `.fc` host restores the scope without moving it off <body>.
  const host = document.createElement('div')
  host.id = GHOST_ID
  host.className = source.closest('.cal-motion-on') ? 'fc cal-motion-on' : 'fc'
  host.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:70;'

  const ghost = source.cloneNode(true) as HTMLElement
  ghost.className = `${source.className} kf-cal-ghost`
  // Size and neutralise the grid placement WITHOUT cssText, which would wipe the inline
  // --kf-ev-* custom properties eventDidMount sets for a coloured event.
  ghost.style.position = 'relative'
  ghost.style.inset = 'auto'
  ghost.style.margin = '0'
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  host.appendChild(ghost)
  document.body.appendChild(host)

  // Grab offset keeps the ghost under the same spot on the block the pointer picked up.
  const grabX = ev ? ev.clientX - rect.left : rect.width / 2
  const grabY = ev ? ev.clientY - rect.top : rect.height / 2
  // The host carries the position so the ghost itself keeps the 2c wobble on its own transform.
  const move = (e: MouseEvent) => {
    host.style.transform = `translate(${e.clientX - grabX}px, ${e.clientY - grabY}px)`
  }
  if (ev) move(ev)
  window.addEventListener('mousemove', move)
  window.addEventListener('dragover', move as EventListener)

  return () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('dragover', move as EventListener)
    host.remove()
  }
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
  onCompleteTask,
  conflictedIds,
  justDroppedId,
}, ref) {
  const customView = 'customDayCount'
  const fcRef = useRef<FullCalendar>(null)
  // Teardown for the Motion 4c free ghost; held across the drag lifecycle.
  const stopGhostRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopGhostRef.current?.(), []) // never strand a ghost on unmount

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
      // R4 (2026-07-20): the chip read a constant "12:00 AM". `arg.date` is a FullCalendar
      // DateMarker — wall-clock encoded AS UTC — so toLocaleTimeString shifted it a second time
      // by the local offset (21:41 Cairo -> 00:41 "local"). The chip always means "now", and FC's
      // NowTimer re-renders it every minute, so read the real clock instead of the marker.
      nowIndicatorContent={(arg) =>
        arg.isAxis ? null : (
          <span className="cal-now-chip">
            {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
        // A coloured event keeps 4c's exact geometry and only swaps the hue. The colour rides
        // extendedProps rather than FC's backgroundColor/borderColor, because those land as
        // inline styles that would beat the stylesheet and undo the 4c fill/edge.
        ev.extendedProps = { kfColor: e.color ?? null, kfTaskId: e.taskId ?? null, kfTaskDone: !!e.taskDone }
        return ev
      })}
      // 4c renders the title above the time. FC emits them the other way round, so own the
      // structure outright — that also gives task-linked blocks their checkbox (R4, 2026-07-20)
      // and finally puts real emoji in event titles (the last EmojiText gap from R4-4).
      eventContent={(arg) => {
        const { kfTaskId, kfTaskDone } = arg.event.extendedProps as { kfTaskId: string | null; kfTaskDone: boolean }
        const done = !!kfTaskDone
        return (
          <div className={`kf-ev-row${done ? ' kf-done' : ''}`}>
            {kfTaskId && !arg.isMirror && (
              <span
                className={`kf-ev-check${done ? ' kf-on' : ''}`}
                role="checkbox"
                aria-checked={done}
                aria-label={`${done ? 'Reopen' : 'Complete'} ${arg.event.title}`}
                ref={dragGuard(() => onCompleteTask?.(kfTaskId, done))}
              >
                {done ? '✓' : ''}
              </span>
            )}
            <div className="kf-ev-text">
              <div className="fc-event-title"><EmojiText text={arg.event.title} /></div>
              {arg.timeText && <div className="fc-event-time">{arg.timeText}</div>}
            </div>
          </div>
        )
      }}
      eventDidMount={(info) => {
        // Motion 4c: one geometry, per-event hue. The defaults in CSS are 4c's own lavender
        // values (fill .24 / edge .35 / grip .5); a coloured event restates them in its colour
        // at the same alphas, so nothing about the block's shape or weight changes.
        const own = (info.event.extendedProps as { kfColor?: string })?.kfColor
        if (own) {
          const s = info.el.style
          s.setProperty('--kf-ev-accent', own)
          s.setProperty('--kf-ev-fill', `color-mix(in srgb, ${own} 24%, transparent)`)
          s.setProperty('--kf-ev-edge', `color-mix(in srgb, ${own} 55%, transparent)`)
          s.setProperty('--kf-ev-grip', `color-mix(in srgb, ${own} 65%, transparent)`)
        }

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
      // Motion 4c: the free ghost lives for the duration of the drag; the snapping placeholder
      // is FC's own mirror. eventDragStop fires before eventDrop, so cleanup is safe here.
      eventDragStart={(info) => {
        stopGhostRef.current = startGhost(info.el, info.jsEvent as MouseEvent | null)
      }}
      eventDragStop={() => {
        stopGhostRef.current?.()
        stopGhostRef.current = null
      }}
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
        // 4c: "the block stretches freely, the handle commits to the grid line" — mark the line.
        flashSnap(info.el)
        flashSnapLine(info.el)
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
