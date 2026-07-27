import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DropArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { EmojiText } from '../../components/EmojiText'
import { daisyColumnStage } from '../../lib/growthStages'
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

export type CalendarGridView = 'timeGridDay' | 'customDayCount' | 'rollingWeek' | 'dayGridMonth'

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
  /** allDay flips when a drag crosses the all-day band ↔ time grid boundary (CALENDAR.md §6). */
  onMove: (id: string, start: string, end: string, allDay: boolean) => void
  onResize: (id: string, start: string, end: string) => void
  onEventClick: (id: string) => void
  /** Punch 34: double-click a task-linked block → straight to the task editor. */
  onEventDoubleClick?: (id: string) => void
  onExternalDrop: (taskId: string, start: string, allDay: boolean) => void
  /** Punch 33: a block dragged off the grid onto this element unschedules. Returns true when
   * handled — false (or a non-task block) gets the §7 invalid-drop soft-no instead. */
  railRef?: React.RefObject<HTMLElement | null>
  onDragToRail?: (eventId: string) => boolean
  /** Punch 32 view options with grid-level backing. */
  hour24?: boolean
  firstDay?: number
  hiddenDays?: number[]
  density?: 's' | 'm' | 'l'
  onEventContextMenu?: (eventId: string, x: number, y: number) => void
  /** Right-click on empty grid space (not an existing event) — resolves the exact slot under the cursor. */
  onGridContextMenu?: (iso: string, allDay: boolean, x: number, y: number) => void
  /** Toggles the task behind a block from its checkbox. `done` is the state it was just in. */
  onCompleteTask?: (taskId: string, done: boolean) => void
  conflictedIds?: string[]
  /* CALENDAR.md §7: outbox visibility — queued writes render pending, rejected ones failed. */
  pendingIds?: string[]
  failedIds?: string[]
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
  initialView = 'rollingWeek',
  hideToolbar,
  onRangeChange,
  onCreate,
  onMove,
  onResize,
  onEventClick,
  onEventDoubleClick,
  onExternalDrop,
  railRef,
  onDragToRail,
  hour24,
  firstDay,
  hiddenDays,
  density = 'm',
  onEventContextMenu,
  onGridContextMenu,
  onCompleteTask,
  conflictedIds,
  pendingIds,
  failedIds,
  justDroppedId,
}, ref) {
  const customView = 'customDayCount'
  const fcRef = useRef<FullCalendar>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // CALENDAR.md §5 temporal states (in progress / past / ran over) move with the clock — one
  // re-render per minute keeps them honest without any per-block timers.
  const [, setMinute] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setMinute((m) => m + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  // Rendered day-column count, from datesSet — drives the min-width that makes the grid
  // horizontally scrollable instead of crushing columns (Kai: "why cant I scroll horizontally").
  const [visibleDays, setVisibleDays] = useState(initialView === 'timeGridDay' ? 1 : 7)
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
    // 170px per day column + the time axis: below that the grid scrolls horizontally in the
    // page's scroller instead of crushing the last day into a sliver (CALENDAR.md §6 narrow-col).
    // --kf-cal-density folds the view-options Density into the --s scale (CalendarGrid.css);
    // it's also in the FC key because slot geometry is measured once per mount.
    <div
      ref={wrapRef}
      onContextMenu={handleGridContextMenu}
      style={{ height: '100%', minWidth: visibleDays > 1 ? 58 + visibleDays * 170 : undefined, ['--kf-cal-density' as string]: density === 's' ? 0.8 : density === 'l' ? 1.2 : 1 } as React.CSSProperties}
    >
    <FullCalendar
      key={`${initialView}-${dayCount}-${density}`}
      ref={fcRef}
      plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
      initialView={initialView}
      firstDay={firstDay}
      hiddenDays={hiddenDays}
      // Punch 35: top-edge resize — start moves, end stays put. FC's own start handle.
      eventResizableFromStart
      // Punch 33/35: an off-grid drop reverts instantly (rail handles deletion, soft-no shakes);
      // the default 500ms glide-back would fight both.
      dragRevertDuration={0}
      // Punch 32: 24-hour toggle drives both the block time rows and the gutter labels.
      eventTimeFormat={hour24 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', minute: '2-digit', hour12: true }}
      slotLabelFormat={hour24 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', hour12: true }}
      views={{
        [customView]: {
          type: 'timeGrid',
          duration: { days: dayCount },
          // Duration views start at the current date, so today leads instead of trailing.
          dateAlignment: 'day',
          dateIncrement: { days: dayCount },
          buttonText: `${dayCount}d`,
        },
        // Kai 2026-07-21: "why am I stuck with having to see today as the last day of the
        // week" — a Sun-Sat week puts Saturday last all day Saturday. Week is now a ROLLING
        // 7 days starting today; prev/next steps a full week.
        rollingWeek: {
          type: 'timeGrid',
          duration: { days: 7 },
          dateAlignment: 'day',
          dateIncrement: { days: 7 },
        },
      }}
      headerToolbar={hideToolbar ? false : { left: 'prev,next today', center: 'title', right: `timeGridDay,${customView},timeGridWeek,dayGridMonth` }}
      datesSet={(arg: DatesSetArg) => {
        onRangeChange?.({ title: arg.view.title, start: arg.view.currentStart, end: arg.view.currentEnd })
        if (arg.view.type !== 'dayGridMonth') setVisibleDays(Math.max(1, Math.round((arg.view.currentEnd.getTime() - arg.view.currentStart.getTime()) / 86_400_000)))
      }}
      height="100%"
      scrollTime="08:00:00"
      // Motion 4c "Calendar drag dialect · snap": "30-min grid in the real view". Both were
      // relying on FullCalendar's defaults happening to be 30min — state the contract instead,
      // so the placeholder steps in half-hours and a drag can't land on an off-grid time.
      slotDuration="00:30:00"
      snapDuration="00:30:00"
      // Punch 37: edge auto-scroll while dragging is FC's own AutoScroller — enabled by default,
      // wired to `.fc-scroller` (the time-grid's vertical scroller), 50px edge zone, quadratic
      // ramp to a gentle 300px/s. Stated explicitly so nobody "cleans it up" to false.
      dragScroll
      dayMaxEvents
      dayHeaderContent={(arg) => {
        // Month view's header row is one cell per weekday, not per date — no daisy, no number.
        if (arg.view.type === 'dayGridMonth') {
          return <div className="cal-day-header-month">{arg.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        }
        // Punch 39 — WA2 contract "Day headers with daisy": past column past.png 26px + cell
        // opacity .62 · today = clock stage 30px + shadow-drop-sm + lavender + "Fri · Today" ·
        // future = future.png 26px. Stages come from lib/growthStages (never re-bucketed here).
        // arg.date is a FC DateMarker — wall-clock encoded AS UTC (same trap the now-chip hit,
        // R4 2026-07-20) — so its calendar fields read back through the getUTC* getters.
        const d = arg.date
        const now = new Date()
        const dayDelta = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000
        const stage = daisyColumnStage(dayDelta, now.getHours())
        const isToday = dayDelta === 0
        return (
          <div className={`cal-day-header${isToday ? ' cal-day-header-today' : ''}${stage === 'past' ? ' cal-day-header-past' : ''}`}>
            <img src={`/ds/assets/daisy/${stage}.png`} alt="" className="cal-day-daisy" />
            <div>
              <div className="cal-day-header-name">
                {d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                {isToday ? ' · Today' : ''}
              </div>
              <div className="cal-day-header-num">{String(d.getUTCDate()).padStart(2, '0')}</div>
            </div>
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
            {new Date().toLocaleTimeString('en-US', { hour: hour24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !hour24 })}
          </span>
        )
      }
      selectable
      selectMirror
      // Kai 2026-07-21: "when I change the type the ghost highlight dissapears" — clicking
      // anything in our own popover counts as a click outside the grid, so FC unselectAuto
      // wiped the slot highlight. Exempt the popover from it.
      unselectCancel=".kf-quickcreate"
      editable
      droppable
      events={events.map((e) => {
        // ── CALENDAR.md §0: one block, five independent axes, composed as classes. ──
        const startMs = new Date(e.start).getTime()
        const endMs = new Date(e.end).getTime()
        const now = Date.now()
        const isTaskish = e.type !== 'event' // task + time_block are completable kinds

        const classes = ['fc-event-type-' + e.type]
        // Kind (§3, hue only): tasks/blocks ride lavender (or their project hue, set inline in
        // eventDidMount); a plain event is a Meeting → blossom. Ritual/Focus/Admin/External
        // kinds need data the schema doesn't carry yet.
        classes.push(isTaskish ? 'kf-kind-task' : 'kf-kind-event')
        // Layout (§6): tier by DRAWN height at 0.9px/min — micro <27, short <54, std <81, full ≥81.
        const drawnPx = ((endMs - startMs) / 60_000) * 0.9
        classes.push(drawnPx < 27 ? 'kf-tier-micro' : drawnPx < 54 ? 'kf-tier-short' : drawnPx < 81 ? 'kf-tier-std' : 'kf-tier-full')
        // Temporal (§5): ran-over (task not done, end passed) is the one terra exception and
        // outranks plain past-dimming; in-progress carries the elapsed wash.
        const ranOver = isTaskish && !!e.taskId && !e.taskDone && endMs < now && !e.allDay
        if (ranOver) classes.push('kf-ranover')
        else if (endMs < now) classes.push('kf-past')
        else if (startMs <= now) classes.push('kf-inprog')
        // Semantic (§4): completed / conflict are the two states the data can express today
        // (tentative/declined/cancelled/RSVP/free need status columns the schema doesn't have).
        if (e.taskDone) classes.push('kf-done')
        const conflicted = conflictedIds?.includes(e.id) ?? false
        if (conflicted) classes.push('fc-event-conflict')
        // Interaction (§7): outbox visibility — pending dashes, sync-failed warns.
        if (pendingIds?.includes(e.id)) classes.push('kf-pending')
        if (failedIds?.includes(e.id)) classes.push('kf-failed')
        if (e.id === justDroppedId) classes.push('kf-settle-in')

        const ev: Record<string, unknown> = { id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, classNames: classes }
        // A coloured event keeps 4c's exact geometry and only swaps the hue. The colour rides
        // extendedProps rather than FC's backgroundColor/borderColor, because those land as
        // inline styles that would beat the stylesheet and undo the 4c fill/edge.
        ev.extendedProps = {
          kfColor: e.color ?? null,
          kfTaskId: e.taskId ?? null,
          kfTaskDone: !!e.taskDone,
          kfStart: startMs,
          kfEnd: endMs,
          kfRanOver: ranOver,
          kfConflict: conflicted,
          kfPending: pendingIds?.includes(e.id) ?? false,
          kfFailed: failedIds?.includes(e.id) ?? false,
          kfFull: drawnPx >= 81,
        }
        return ev
      })}
      // 4c renders the title above the time. FC emits them the other way round, so own the
      // structure outright — that also gives task-linked blocks their checkbox (R4, 2026-07-20)
      // and finally puts real emoji in event titles (the last EmojiText gap from R4-4).
      eventContent={(arg) => {
        const p = arg.event.extendedProps as {
          kfTaskId: string | null; kfTaskDone: boolean; kfStart: number; kfEnd: number
          kfRanOver: boolean; kfConflict: boolean; kfPending: boolean; kfFailed: boolean; kfFull: boolean
        }
        const done = !!p.kfTaskDone
        const now = Date.now()

        // §5 temporal time labels: in-progress counts down, ran-over names the missed end.
        let timeText = arg.timeText
        if (p.kfRanOver) {
          timeText = `Ran over · ${new Date(p.kfEnd).toLocaleTimeString('en-US', { hour: hour24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !hour24 })}`
        } else if (!done && p.kfStart <= now && now < p.kfEnd) {
          timeText = `Now · ${Math.max(1, Math.ceil((p.kfEnd - now) / 60_000))}m left`
        } else if (p.kfFull && arg.timeText) {
          // full tier has room for the duration suffix (§2 "as space allows")
          const mins = Math.round((p.kfEnd - p.kfStart) / 60_000)
          timeText = `${arg.timeText} · ${mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`}`
        }
        // §7 outbox suffixes ride the time row
        if (p.kfPending) timeText = `${timeText || ''} · saving ◌`
        if (p.kfFailed) timeText = `${timeText || ''} · retry`

        // §0 one badge slot, ranked: ⚠ (conflict or sync-fail) > completed petal.
        const badge = p.kfConflict || p.kfFailed ? '⚠' : done ? 'petal' : null

        // §5 in-progress elapsed wash: the lived proportion, ACCENT-DEEP at 14%.
        const elapsedPct =
          !done && !p.kfRanOver && p.kfStart <= now && now < p.kfEnd
            ? Math.round(((now - p.kfStart) / (p.kfEnd - p.kfStart)) * 100)
            : 0

        return (
          <div className={`kf-ev-row${done ? ' kf-done' : ''}`}>
            {elapsedPct > 0 && <span className="kf-ev-elapsed" style={{ height: `${elapsedPct}%` }} aria-hidden="true" />}
            {badge === '⚠' && <span className="kf-ev-badge" title={p.kfFailed ? 'Sync failed' : 'Overlaps another block'}>⚠</span>}
            {badge === 'petal' && <span className="kf-ev-badge kf-ev-petal" aria-hidden="true" />}
            {p.kfTaskId && !arg.isMirror && (
              <span
                className={`kf-ev-check${done ? ' kf-on' : ''}`}
                role="checkbox"
                aria-checked={done}
                aria-label={`${done ? 'Reopen' : 'Complete'} ${arg.event.title}`}
                ref={dragGuard(() => onCompleteTask?.(p.kfTaskId!, done))}
              >
                {done ? '✓' : ''}
              </span>
            )}
            <div className="kf-ev-text">
              <div className="fc-event-title"><EmojiText text={arg.event.title} /></div>
              {timeText && <div className="fc-event-time">{timeText}</div>}
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

        // Punch 34: double-click goes straight to the task editor (single click still opens
        // the details popover — the navigation unmounts it, so the two don't fight).
        if (onEventDoubleClick) {
          info.el.addEventListener('dblclick', () => onEventDoubleClick(info.event.id))
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
      eventDragStop={(info) => {
        const stop = stopGhostRef.current
        stopGhostRef.current = null
        const je = info.jsEvent as MouseEvent | null
        const contains = (el: Element | null | undefined) => {
          if (!el || !je) return false
          const r = el.getBoundingClientRect()
          return je.clientX >= r.left && je.clientX <= r.right && je.clientY >= r.top && je.clientY <= r.bottom
        }
        // The pointer left the grid, so FC reverts (instantly, dragRevertDuration 0).
        // Rail = punch 33 unschedule; anywhere else = §7 invalid drop → the soft-no:
        // the ghost shakes ±4px decaying ~320ms and nothing is created.
        if (je && wrapRef.current && !contains(wrapRef.current)) {
          const handled = contains(railRef?.current) && (onDragToRail?.(info.event.id) ?? false)
          if (!handled) {
            const host = document.getElementById(GHOST_ID)
            if (host) {
              host.classList.add('kf-cal-softno')
              window.setTimeout(() => stop?.(), 340)
              return
            }
          }
        }
        stop?.()
      }}
      eventDrop={(info: EventDropArg) => {
        // Motion 4c: the placeholder snaps to the grid on commit — a brief flash marks the moment,
        // scoped in CSS to `.cal-motion-on` so it's a no-op when the caller's motion gate is off.
        flashSnap(info.el)
        if (info.event.start) {
          // Crossing the all-day boundary nulls the end (FC convention) — restate a real one:
          // a converted all-day block spans its day; a re-timed chip gets the default hour.
          const allDay = info.event.allDay
          const end = info.event.end ?? new Date(info.event.start.getTime() + (allDay ? 86_400_000 : 3_600_000))
          onMove(info.event.id, info.event.start.toISOString(), end.toISOString(), allDay)
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
          // §7 resizing: min 30 min. Clamp on the edge that moved — a top-edge (start) resize
          // pushes the start back up; a bottom-edge resize pulls the end back down.
          let startMs = info.event.start.getTime()
          let endMs = info.event.end.getTime()
          const MIN = 30 * 60_000
          if (!info.event.allDay && endMs - startMs < MIN) {
            const startMoved = info.startDelta.milliseconds !== 0 || info.startDelta.days !== 0
            if (startMoved) startMs = endMs - MIN
            else endMs = startMs + MIN
          }
          onResize(info.event.id, new Date(startMs).toISOString(), new Date(endMs).toISOString())
        }
      }}
      drop={(info: DropArg) => {
        const taskId = info.draggedEl.dataset.taskId
        if (!taskId || !info.date) return
        onExternalDrop(taskId, info.date.toISOString(), info.allDay)
      }}
    />
    </div>
  )
})
