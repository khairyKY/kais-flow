import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { Draggable, type DropArg } from '@fullcalendar/interaction'
import type { DateSelectArg, DatesSetArg, DayHeaderContentArg, EventClickArg, EventContentArg, EventDropArg, EventMountArg, NowIndicatorContentArg } from '@fullcalendar/core'
import type { EventDragStartArg, EventDragStopArg, EventResizeDoneArg, EventResizeStartArg, EventResizeStopArg } from '@fullcalendar/interaction'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { daisyColumnStage } from '../../lib/growthStages'
import { dragGuard } from './dragGuard'
import { markSeen } from '../tour/help'
import { layoutOverlaps } from './overlapLayout'
import { cairoDateKey, zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { addDays, durationLabel } from '../../components/pickerMath'
import { bandSegments, isMultiDaySpan, spanDays } from './daySpans'
import { timeRange, zoneHour } from './eventTime'
import { appZone, useAppZone } from '../../lib/appZone'
import { clockOptions, clockRange, clockText } from '../../lib/clock'
import { useMinuteClock } from '../../lib/minuteClock'
import { intlZonePlugin } from './zonePlugin'
import { headerDay, scrollTimeNear, SCROLL_LEAD_DESKTOP_MIN } from './gridClock'
import { gridMinWidth, isNarrow } from './weekFit'
import { StackMorePopover } from './StackMorePopover'
import { useDayRollover } from './useDayRollover'
import { cardDragData } from './planningMode'
import { liftCards } from './cardDrag'
import { blockHue } from './blockHue'
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
  /** One occurrence of a repeating event (CALENDAR-BLOCK-STATES C10): the ↻ badge. */
  repeat?: boolean
  /** A Time block's tasks (Time Slots, 0073), drawn as rows inside it, and its "2 tasks · 45m of 2h". */
  held?: { id: string; title: string; done: boolean; minutes: number }[]
  fill?: string
  /** A Google event (google-sync, B1): drawn like any event, never dragged or resized. */
  readOnly?: boolean
  /** A subtask's own block (Subtasks C, Kai 2026-10-16): its parent's title, "↳ parent" on the time row. */
  parent?: string | null
  /** Today's block of the goal of the day (the first of today's Top 3): the gold edge and ✶ (goal A, Kai 2026-10-23). */
  goal?: boolean
}

export type CalendarGridView = 'timeGridDay' | 'customDayCount' | 'rollingWeek' | 'dayGridMonth'

/** Imperative nav — the design's prev/today/next pills live in CalendarPage's own header,
 * not FullCalendar's built-in toolbar (hidden via `hideToolbar`), so they need a way to
 * reach the underlying Calendar API. */
export interface CalendarGridHandle {
  prev(): void
  next(): void
  today(): void
  /** Shows the range holding `date` (a search hit for an event — Kai 2026-10-06). */
  gotoDate(date: Date): void
  /** Drops the slot highlight (quick-create closed) — FullCalendar keeps it, and a click on a
   * still-selected slot never selects again, so the same slot couldn't be reopened. */
  unselect(): void
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
  /** An empty slot clicked or dragged. `task`: with ⌘/Ctrl held — Akiflow's ⌘-click makes a task there (p7e A4).
   * `dragged`: the pointer moved between press and release (a click selects one quarter too). */
  onCreate: (info: { start: string; end: string; allDay: boolean; x: number; y: number; task?: boolean; dragged?: boolean }) => void
  /** allDay flips when a drag crosses the all-day band ↔ time grid boundary (CALENDAR.md §6). */
  onMove: (id: string, start: string, end: string, allDay: boolean) => void
  onResize: (id: string, start: string, end: string) => void
  /** `add`: with Ctrl / ⌘ / Shift held — the block joins (or leaves) the multi-selection. */
  onEventClick: (id: string, add?: boolean) => void
  /** Multi-select (Kai 2026-10-22): the picked blocks, outlined; dragging one of them moves them all. */
  pickedIds?: readonly string[]
  /** The picked blocks moved by the dragged one's delta — true when handled. */
  onMoveMany?: (ids: readonly string[], deltaMs: number) => boolean
  /** Punch 34: double-click a task-linked block → straight to the task editor. */
  onEventDoubleClick?: (id: string) => void
  /** A rail card dropped on the grid: a task (`data-task-id`) or an inbox item (`data-inbox-id`). */
  onExternalDrop: (from: { taskId?: string; inboxId?: string }, start: string, allDay: boolean) => void
  /** Kai 2026-10-07: an overdue block's "Replan" (a task block that ended before today, not done). */
  onReplan?: (eventId: string, x: number, y: number) => void
  /** Punch 33: a block dragged off the grid onto this element. `section` is the rail section under
   * the pointer (its `data-section`), null on rail chrome. Returns true when handled — false gets
   * the §7 invalid-drop soft-no instead. */
  railRef?: React.RefObject<HTMLElement | null>
  onDragToRail?: (eventId: string, section: string | null) => boolean
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
  /** A task block's ▶ (on hover, as the options page's "Now" draws it): Focus on its task. */
  onFocusTask?: (taskId: string) => void
  /** ⋯ (or a right-click) on a task row inside a Time slot: its task menu (Out of the slot…). */
  onSlotTaskMenu?: (taskId: string, x: number, y: number) => void
  /** slots-ux: a click on a held row opens its task; its × takes it out of the slot; dragged onto
   * the rail (`section` as for a block) it comes out — true when handled. Onto the grid it drops
   * through onExternalDrop, like a rail card. */
  onSlotTaskOpen?: (taskId: string, el: Element) => void
  onSlotTaskOut?: (taskId: string) => void
  onSlotTaskToRail?: (taskId: string, section: string | null) => boolean
  conflictedIds?: string[]
  /* CALENDAR.md §7: outbox visibility — queued writes render pending, rejected ones failed. */
  pendingIds?: string[]
  failedIds?: string[]
  /** Effects 21 — id of an event just created by an external drop; its chip plays the settle-in. */
  justDroppedId?: string | null
  /** How far above the now-line the grid lands (gridClock.ts). */
  scrollLeadMinutes?: number
  /** Calendar §4 planning mode: the collapsed agenda strip — mono day row (none for one day), no
   * empty all-day band, and its free stretches drawn as dashed "2h free" boxes. */
  strip?: boolean
  freeGaps?: { start: string; end: string; label: string }[]
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
  if (!timeStr) return { iso: new Date(y0, mo - 1, d).toISOString(), allDay: true } // a date in no zone (slotFields)
  const [hh, mm] = timeStr.split(':').map(Number)
  // The slot's wall clock is the grid's: the user's zone (`timeZone` below), not the device's.
  return { iso: zoneWallTimeToIso(appZone(), y0, mo, d, hh, mm), allDay: false }
}

/** The rail section (`data-section`) under a point, inside `rail` only. */
function railSectionAt(rail: HTMLElement | null | undefined, x: number, y: number): HTMLElement | null {
  const sec = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-section]') ?? null
  return sec && rail?.contains(sec) ? sec : null
}

/** Kai 2026-10-12: while a block is dragged, the rail section under the pointer carries
 * `data-drop-over` (CalendarPage styles it). Returns the teardown. */
function trackRailHover(rail: HTMLElement | null | undefined): () => void {
  if (!rail) return () => {}
  let over: HTMLElement | null = null
  const move = (e: MouseEvent) => {
    const sec = railSectionAt(rail, e.clientX, e.clientY)
    if (sec === over) return
    over?.removeAttribute('data-drop-over')
    sec?.setAttribute('data-drop-over', '')
    over = sec
  }
  window.addEventListener('mousemove', move)
  return () => {
    window.removeEventListener('mousemove', move)
    over?.removeAttribute('data-drop-over')
  }
}

/** One geometry, per-event hue: the CSS mixes the fill, edge and grip from --kf-ev-c (the kind's accent by
 * default) and reads --kf-ev-accent for the time row and the check (cal-looks: the options page's "Now").
 * A coloured block sets its accent and ink (./blockHue); no colour clears them (back to the kind's hue). */
function paintColor(el: HTMLElement, color: string | null | undefined): void {
  const s = el.style
  if (!color) {
    for (const v of ['--kf-ev-c', '--kf-ev-accent', '--kf-ev-deep']) s.removeProperty(v)
    return
  }
  const { c, ink } = blockHue(color)
  s.setProperty('--kf-ev-c', c)
  s.setProperty('--kf-ev-accent', ink)
  s.setProperty('--kf-ev-deep', ink)
}

/** Calendar 3e: a multi-day span is drawn as one all-day piece per day (`<id>§<day>`); every
 * click, menu and lookup acts on the block itself. */
const SEG = '§'
const blockIdOf = (ev: { id: string; extendedProps: Record<string, unknown> }): string => (ev.extendedProps.kfSegOf as string | undefined) ?? ev.id

/** Date keys from `first` to `last`, inclusive (at most `max`). */
function dayRange(first: string, last: string, max = 62): string[] {
  const out: string[] = []
  for (let d = first; d <= last && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
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

// ── Calendar smoothness S1 (2026-10-22 audit): FullCalendar's React adapter re-runs resetOptions on every
// render and compares callbacks and formats by identity and `events` element by element — a new array
// re-parses every event and re-renders every block. So everything handed to it below is stable: module
// constants, memoised values, and callbacks that read the latest props through `latest` (a ref). What
// changes a block's drawing travels in that block's extendedProps; what changes only its look (outbox
// marks, multi-select, the minute's temporal state) is set on its element, never through the data. ──
const PLUGINS = [timeGridPlugin, dayGridPlugin, interactionPlugin, intlZonePlugin]

type FcShared = { arr: Record<string, unknown>[]; byKey: Map<string, Record<string, unknown>> }
/** Motion pass (2026-10-22): FullCalendar compares `events` one object at a time, by identity. A block
 * whose drawing didn't change keeps last time's object, so the server's echo of a write the screen
 * already shows — new rows, the same blocks — costs FullCalendar nothing (it was a second full pass). */
function shareEvents(prev: FcShared, next: Record<string, unknown>[]): FcShared {
  const byKey = new Map<string, Record<string, unknown>>()
  let same = next.length === prev.arr.length
  const arr = next.map((ev, i) => {
    const k = JSON.stringify(ev)
    const v = prev.byKey.get(k) ?? ev
    byKey.set(k, v)
    if (v !== prev.arr[i]) same = false
    return v
  })
  return same ? prev : { arr, byKey }
}

// S7: one Intl formatter per (zone, clock) — toLocaleTimeString built a new one per call, several per block.
const clockFormats = new Map<string, Intl.DateTimeFormat>()
function clockFormatter(zone: string, h24: boolean): (ms: number) => string {
  const key = `${zone}|${h24 ? 24 : 12}`
  let f = clockFormats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { ...clockOptions(h24), timeZone: zone })
    clockFormats.set(key, f)
  }
  const fmt = f
  return (ms: number) => fmt.format(ms)
}

type BlockProps = {
  kfTaskId: string | null; kfTaskDone: boolean; kfStart: number; kfEnd: number; kfTaskish: boolean
  kfOverdue: boolean; kfConflict: boolean; kfGoal: boolean
  kfMore: string[] | null; kfPinned: boolean; kfRepeat: boolean
  kfHeld: { id: string; title: string; done: boolean; minutes: number }[] | null; kfFill: string | null; kfParent: string | null
}

/** §5 temporal state at `now`: ran over (a task not done, its end passed) outranks past; in progress
 * carries the minutes left and the lived share. Overdue (ended before today) is the day's, not the minute's. */
function phaseAt(p: Pick<BlockProps, 'kfStart' | 'kfEnd' | 'kfTaskId' | 'kfTaskDone' | 'kfTaskish'>, allDay: boolean, now: number): string {
  if (p.kfTaskish && p.kfTaskId && !p.kfTaskDone && p.kfEnd < now && !allDay) return 'ranover'
  if (p.kfEnd < now) return 'past'
  if (p.kfStart <= now) return allDay || p.kfTaskDone ? 'now' : `now:${Math.max(1, Math.ceil((p.kfEnd - now) / 60_000))}:${Math.round(((now - p.kfStart) / (p.kfEnd - p.kfStart)) * 100)}`
  return 'later'
}
const PHASE_CLASS: Record<string, string> = { ranover: 'kf-ranover', past: 'kf-past', now: 'kf-inprog' }
const phaseClass = (phase: string): string | null => PHASE_CLASS[phase.split(':')[0]] ?? null

/** S9: a block's time row and its elapsed wash read the app's one minute clock (lib/minuteClock) —
 * only a block whose state changed re-renders, and its element's temporal class follows, so the minute
 * never re-renders the grid. `children` draws the row from the live words ("Ran over · 4:45 PM", "Now ·
 * 51m left") or null. */
function LiveTime({ p, allDay, overdue, clock, children }: { p: BlockProps; allDay: boolean; overdue: boolean; clock: (ms: number) => string; children: (live: string | null) => ReactNode }) {
  const phase = useMinuteClock((s) => phaseAt(p, allDay, s.now))
  const ref = useRef<HTMLSpanElement>(null)
  const [kind, left, pct] = phase.split(':')
  useLayoutEffect(() => {
    const el = ref.current?.closest<HTMLElement>('.fc-event')
    if (!el || overdue) return
    const want = phaseClass(phase)
    for (const c of Object.values(PHASE_CLASS)) el.classList.toggle(c, c === want)
    // The lived share washes in from the block's top edge, the whole width (CalendarGrid.css .kf-inprog).
    if (kind === 'now' && pct) el.style.setProperty('--kf-elapsed', `${pct}%`)
    else el.style.removeProperty('--kf-elapsed')
  }, [phase, overdue, kind, pct])
  const live = overdue ? null : kind === 'ranover' ? `Ran over · ${clock(p.kfEnd)}` : kind === 'now' && left ? `Now · ${left}m left` : null
  return (
    <>
      <span ref={ref} hidden />
      {children(live)}
    </>
  )
}

/** S2 + M1 (2026-10-22 audit): a moved block used to show at its old slot for ~0.4 s after the drop,
 * then jump. The ghost now stays up until the block has painted in its new place (kept hidden meanwhile,
 * `data-landing`), settles onto it — 160 ms, --ease-out, transform only — and goes; the block then wears
 * the just-landed ring. With Effects off or reduced motion it just goes once the block is there. */
function settleGhost(landing: { stop: () => void; host: HTMLElement | null }, id: string, motion: boolean): void {
  const sel = `.fc-event[data-kf-id="${CSS.escape(id)}"]:not(.fc-event-mirror)`
  const mark = (on: boolean) => document.querySelectorAll<HTMLElement>(sel).forEach((el) => el.toggleAttribute('data-landing', on))
  const finish = () => {
    mark(false)
    landing.stop()
    if (motion) landRing(id)
  }
  mark(true)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      mark(true) // FullCalendar may have drawn a new element meanwhile
      const el = document.querySelector<HTMLElement>(sel)
      const host = landing.host
      const ghost = host?.firstElementChild as HTMLElement | null
      if (!el || !host || !ghost || !motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
      const r = el.getBoundingClientRect()
      host.style.transition = 'transform 160ms var(--ease-out)'
      host.style.transform = `translate(${r.left}px, ${r.top}px)`
      ghost.classList.add('kf-cal-ghost-settle')
      window.setTimeout(finish, 170)
    }),
  )
}

/** M1 / M8: the just-landed ring (§7, 300 ms) on a block that arrived — dropped, created, restored. An
 * attribute on its element, never FullCalendar's data (no repaint). */
function landRing(id: string): void {
  document.querySelectorAll<HTMLElement>(`.fc-event[data-kf-id="${CSS.escape(id)}"]:not(.fc-event-mirror)`).forEach((el) => {
    el.removeAttribute('data-landed')
    void el.offsetWidth // restart the animation
    el.setAttribute('data-landed', '')
    window.setTimeout(() => el.removeAttribute('data-landed'), 340)
  })
}

/** M8: a block that left (deleted, unscheduled, undone) fades out where it was — a copy over the grid,
 * 120 ms, opacity and a little scale; the data never waits for it. */
function fadeOut(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return
  const host = document.createElement('div')
  host.className = el.closest('.cal-motion-on') ? 'fc cal-motion-on' : 'fc'
  host.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:60;transform:translate(${r.left}px, ${r.top}px)`
  const copy = el.cloneNode(true) as HTMLElement
  copy.classList.add('kf-cal-leaving')
  copy.removeAttribute('data-kf-id')
  copy.style.position = 'relative'
  copy.style.inset = 'auto'
  copy.style.margin = '0'
  copy.style.width = `${r.width}px`
  copy.style.height = `${r.height}px`
  host.appendChild(copy)
  document.body.appendChild(host)
  window.setTimeout(() => host.remove(), 160)
}

export const CalendarGrid = memo(forwardRef<CalendarGridHandle, CalendarGridProps>(function CalendarGrid(props, ref) {
  const {
    events,
    dayCount = 7,
    initialView = 'rollingWeek',
    hideToolbar,
    pickedIds,
    hour24 = false,
    firstDay,
    hiddenDays,
    density = 'm',
    conflictedIds,
    pendingIds,
    failedIds,
    justDroppedId,
    scrollLeadMinutes = SCROLL_LEAD_DESKTOP_MIN,
    strip = false,
    freeGaps,
  } = props
  const customView = 'customDayCount'
  // Conductor review 2026-10-12: the grid lays out on the user's zone (lib/appZone) like every other
  // surface — a slot, a block and the now-line read the same clock QuickCreate and the phone do.
  const zone = useAppZone()
  const fcRef = useRef<FullCalendar>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Polish F2b: re-render the day headers ("· Today", the daisy stages) the moment a new day
  // starts, not up to a minute later; a background tab catches up when it becomes visible.
  const today = useDayRollover()
  // Rendered day-column count, from datesSet — drives the min-width that makes the grid
  // horizontally scrollable instead of crushing columns (Kai: "why cant I scroll horizontally").
  const [visibleDays, setVisibleDays] = useState(initialView === 'timeGridDay' ? 1 : 7)
  // Polish D: the wrapper's laid-out width (page CSS px, zoom already inside) decides whether the
  // day columns are §6-narrow (< 170px) — then blocks draw the narrow tier (see weekFit.ts). S3: only
  // the narrow / not-narrow answer is state, so a width change that doesn't cross it renders nothing.
  const widthRef = useRef(0)
  const daysRef = useRef(visibleDays)
  daysRef.current = visibleDays
  const [narrowCols, setNarrowCols] = useState(false)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      widthRef.current = Math.round(entry.contentRect.width)
      setNarrowCols(isNarrow(widthRef.current, daysRef.current))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setNarrowCols(isNarrow(widthRef.current, visibleDays)), [visibleDays])
  const narrow = initialView !== 'dayGridMonth' && narrowCols
  // Calendar 3e: the dates on screen (the user's zone), so a multi-day span is cut into the pieces
  // that show. Null until FullCalendar reports its first range.
  const [shownDays, setShownDays] = useState<string[] | null>(null)
  const clockTime = useMemo(() => clockFormatter(zone, hour24), [zone, hour24])
  // Teardown for the Motion 4c free ghost; held across the drag lifecycle.
  const stopGhostRef = useRef<(() => void) | null>(null)
  const stopHoverRef = useRef<(() => void) | null>(null)
  // S2 + M1: a ghost handed from the drag's end to the drop, which settles it once the block has landed.
  const landingRef = useRef<{ stop: () => void; host: HTMLElement | null; timer: number } | null>(null)
  useEffect(() => () => {
    stopGhostRef.current?.() // never strand a ghost (or a lit rail section) on unmount
    stopHoverRef.current?.()
    landingRef.current?.stop()
  }, [])
  // §6 stacked (3+): the "+N more" popover — the ids it lists and the label it hangs from.
  const [stackMore, setStackMore] = useState<{ ids: string[]; left: number; bottom: number } | null>(null)
  const closeStackMore = useCallback(() => setStackMore(null), [])
  // Polish F2b (conductor decision 2026-09-26): "the block you just dropped always stays visible".
  // A drop, move or resize that makes a block the 4th+ at once used to hide it under "+N more"
  // right where the user let go. It stays on the top lane until the next interaction instead.
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  // An external (rail) drop is created by CalendarPage, which reports its id as justDroppedId.
  // Adjust-state-during-render (React's pattern for "state follows a prop change"), not an effect.
  const [seenDropId, setSeenDropId] = useState(justDroppedId ?? null)
  if ((justDroppedId ?? null) !== seenDropId) {
    setSeenDropId(justDroppedId ?? null)
    if (justDroppedId) setPinnedId(justDroppedId)
  }
  useEffect(() => {
    if (!pinnedId) return
    // "Until the next interaction": any key, or a press anywhere except on the pinned block itself
    // (pressing it to open it or to drag it again must not make it vanish under the pointer).
    const release = (e: Event) => {
      const target = e.target as Element | null
      if (e.type === 'pointerdown' && target?.closest?.(`[data-kf-id="${CSS.escape(pinnedId)}"]`)) return
      setPinnedId(null)
    }
    document.addEventListener('pointerdown', release, true)
    document.addEventListener('keydown', release, true)
    return () => {
      document.removeEventListener('pointerdown', release, true)
      document.removeEventListener('keydown', release, true)
    }
  }, [pinnedId])

  // The latest props and derived values, for the stable callbacks below.
  const latest = useRef({ props, zone, narrow, clockTime, strip, pickedIds: pickedIds ?? [], pending: new Set<string>(), failed: new Set<string>() })
  latest.current = { props, zone, narrow, clockTime, strip, pickedIds: pickedIds ?? [], pending: new Set(pendingIds), failed: new Set(failedIds) }

  // slots-ux (Kai 2026-10-16: "how do I remove a task from the time slot"): a held row is a drag
  // source of its own, as a rail card is — onto the grid it lands through `drop` below (its own block
  // there, or another slot), onto the rail it comes out of the slot (the section decides, as for a
  // block). Its press never reaches the slot's own drag, a click opens the task (the phone's tap
  // does too) and a right-click its menu. A stable ref, so a re-render never drops a drag under way.
  const heldRow = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const id = el.dataset.slotTask!
    let dragged = false
    let stopHover: (() => void) | null = null
    const drag = new Draggable(el, { eventData: cardDragData })
    // slot-outline (Kai's pick A): the lifted card follows the pointer over the grid too; the card's
    // place stays dashed meanwhile (./cardDrag — every card dragged onto the grid lifts this way now).
    liftCards(drag)
    drag.dragging.emitter.on('dragstart', () => {
      dragged = true
      stopHover = trackRailHover(latest.current.props.railRef?.current)
    })
    drag.dragging.emitter.on('dragend', (ev: { pageX: number; pageY: number }) => {
      stopHover?.()
      const rail = latest.current.props.railRef?.current
      const x = ev.pageX - window.scrollX
      const y = ev.pageY - window.scrollY
      const r = rail?.getBoundingClientRect()
      if (rail && r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) latest.current.props.onSlotTaskToRail?.(id, railSectionAt(rail, x, y)?.dataset.section ?? null)
    })
    // No default either: a press would focus the block (FullCalendar's :focus overlay then takes the
    // click and the right-click), as dragGuard's controls know.
    const own = (e: Event) => {
      if (e.type === 'mousedown') {
        dragged = false
        e.preventDefault()
      }
      e.stopPropagation()
    }
    el.addEventListener('mousedown', own)
    el.addEventListener('touchstart', own, { passive: true })
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!dragged) latest.current.props.onSlotTaskOpen?.(id, el)
    })
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      latest.current.props.onSlotTaskMenu?.(id, e.clientX, e.clientY)
    })
    return () => drag.destroy()
  }, [])

  // Kai 2026-10-12 ("you can't edit the colours after they've been created"): FullCalendar keeps an
  // event's element across updates, so eventDidMount — the only place the hue was painted — never
  // re-ran for a recoloured one. Repaint every block from the current data after each render. The same
  // pass sets what never goes through FullCalendar's data: multi-select's data-picked, and (S2) the
  // outbox's pending / failed marks.
  useLayoutEffect(() => {
    const colors = new Map(events.map((e) => [e.id, e.color]))
    const { pickedIds: picked, pending, failed } = latest.current
    wrapRef.current?.querySelectorAll<HTMLElement>('[data-kf-id]').forEach((el) => {
      const id = el.dataset.kfId!
      if (colors.has(id)) paintColor(el, colors.get(id))
      el.toggleAttribute('data-picked', picked.includes(id))
      el.classList.toggle('kf-pending', pending.has(id))
      el.classList.toggle('kf-failed', failed.has(id))
    })
  })

  // M8: blocks that arrive (created, duplicated, restored, dropped from the rail) wear the just-landed
  // ring; blocks that leave fade out where they were. Only while the same days are on screen — paging
  // brings whole weeks in and out, which is no arrival.
  const seen = useRef<{ ids: Set<string>; days: string[] | null } | null>(null)
  useInsertionEffect(() => {
    // Before FullCalendar redraws: the blocks about to go are still on screen.
    const prev = seen.current
    const wrap = wrapRef.current
    if (!prev || prev.days !== shownDays || !wrap?.closest('.cal-motion-on') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ids = new Set(events.map((e) => e.id))
    for (const id of prev.ids) if (!ids.has(id)) wrap.querySelectorAll<HTMLElement>(`.fc-event[data-kf-id="${CSS.escape(id)}"]`).forEach(fadeOut)
  }, [events, shownDays])
  useLayoutEffect(() => {
    const prev = seen.current
    const ids = new Set(events.map((e) => e.id))
    seen.current = { ids, days: shownDays }
    if (!prev || prev.days !== shownDays || !wrapRef.current?.closest('.cal-motion-on')) return
    for (const id of ids) if (!prev.ids.has(id)) landRing(id)
  }, [events, shownDays])

  // J-13 — §6 overlap geometry, decided here and drawn by CalendarGrid.css (FC's own shingle
  // overprinted titles). All-day chips live in the band above the grid and never collide.
  const isSpan = useCallback((e: CalendarGridEvent) => isMultiDaySpan({ starts_at: e.start, ends_at: e.end, all_day: !!e.allDay }, zone), [zone])
  const overlap = useMemo(
    () => layoutOverlaps(events.filter((e) => !e.allDay && !isSpan(e)).map((e) => ({ id: e.id, start: new Date(e.start).getTime(), end: new Date(e.end).getTime() })), pinnedId),
    [events, isSpan, pinnedId],
  )

  // The blocks, as FullCalendar takes them. Built only when what they draw changes.
  const fcShared = useRef<FcShared>({ arr: [], byKey: new Map() })
  const fcEvents = useMemo(() => {
    const day = cairoDateKey(new Date())
    const conflicted = new Set(conflictedIds)
    const next = events.flatMap<Record<string, unknown>>((e) => {
      // Calendar 3e "multi-day span": in the all-day band, one piece per day on screen — only the
      // outer corners round, the open edges read « / », the title on the first piece. A piece is
      // not dragged or resized (the block menu moves it); clicks act on the block.
      if (isSpan(e)) {
        const span = { starts_at: e.start, ends_at: e.end, all_day: !!e.allDay }
        const { first, last } = spanDays(span, zone)
        const kind = e.type !== 'event' ? 'kf-kind-task' : 'kf-kind-event'
        return bandSegments({ ...span, title: e.title }, shownDays ?? dayRange(first, last), zone, clockTime).map((seg, i): Record<string, unknown> => ({
          id: `${e.id}${SEG}${seg.day}`,
          title: seg.label,
          start: seg.day,
          end: addDays(seg.day, 1),
          allDay: true,
          editable: false,
          classNames: ['fc-event-type-' + e.type, kind, 'kf-seg', `kf-seg-${seg.shape}`, ...(i === 0 ? ['kf-seg-titled'] : []), ...(e.taskDone ? ['kf-done'] : [])],
          extendedProps: { kfColor: e.color ?? null, kfSegOf: e.id, kfTitle: e.title },
        }))
      }
      // ── CALENDAR.md §0: one block, five independent axes, composed as classes. ──
      const startMs = new Date(e.start).getTime()
      const endMs = new Date(e.end).getTime()
      const isTaskish = e.type !== 'event' // task + time_block are completable kinds

      const classes = ['fc-event-type-' + e.type]
      // Kind (§3, hue only): tasks/blocks ride lavender (or their project hue, set inline in
      // eventDidMount); a plain event is a Meeting → blossom. Ritual/Focus/Admin/External
      // kinds need data the schema doesn't carry yet.
      classes.push(isTaskish ? 'kf-kind-task' : 'kf-kind-event')
      // Layout (§6): tier by DRAWN height at 0.9px/min — micro <27, short <54, std <81, full ≥81.
      const drawnPx = ((endMs - startMs) / 60_000) * 0.9
      classes.push(drawnPx < 27 ? 'kf-tier-micro' : drawnPx < 54 ? 'kf-tier-short' : drawnPx < 81 ? 'kf-tier-std' : 'kf-tier-full')
      // cal-looks ("Now" as drawn): 30 minutes or less is one line — the check, the title, nothing under it.
      if (endMs - startMs <= 30 * 60_000 && !e.held?.length) classes.push('kf-one')
      // Goal A (Kai 2026-10-23): today's block of the goal of the day wears the gold edge and ✶.
      if (e.goal) classes.push('kf-goal')
      // Temporal (§5) — the minute's (past / in progress / ran over) is eventClassNames' and LiveTime's.
      // Kai 2026-10-07: a task block that ended before today, not done, is overdue — muted, "Overdue ·
      // Replan" (the rail's Overdue holds the same task): the day's, so it's here.
      const overdue = isTaskish && !!e.taskId && !e.taskDone && !e.allDay && cairoDateKey(new Date(endMs - 1)) < day
      if (overdue) classes.push('kf-overdue')
      // Semantic (§4): completed / conflict are the two states the data can express today
      // (tentative/declined/cancelled/RSVP/free need status columns the schema doesn't have).
      if (e.taskDone) classes.push('kf-done')
      const isConflict = conflicted.has(e.id)
      if (isConflict) classes.push('fc-event-conflict')
      if (e.readOnly) classes.push('kf-synced')
      // Layout (§6) geometry: overlap B (Kai 2026-10-23) — each later block steps 22% right over the one
      // under it (lanes 0–2); hidden = under the topmost's "+N more". CalendarGrid.css places FC's harness.
      const slot = overlap.get(e.id)
      if (slot) {
        classes.push('kf-ov')
        classes.push(slot.kind === 'pair' ? `kf-ov-p${slot.lane}` : slot.kind === 'stack' ? `kf-ov-s${slot.lane}` : 'kf-ov-hide')
      }

      const ev: Record<string, unknown> = { id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, classNames: classes, ...(e.readOnly ? { editable: false } : null) }
      // A coloured event keeps 4c's exact geometry and only swaps the hue. The colour rides
      // extendedProps rather than FC's backgroundColor/borderColor, because those land as
      // inline styles that would beat the stylesheet and undo the 4c fill/edge.
      ev.extendedProps = {
        kfColor: e.color ?? null,
        kfTaskId: e.taskId ?? null,
        kfTaskDone: !!e.taskDone,
        kfTaskish: isTaskish,
        kfStart: startMs,
        kfEnd: endMs,
        kfOverdue: overdue,
        kfConflict: isConflict,
        kfGoal: !!e.goal,
        kfH24: hour24,
        kfMore:slot?.kind === 'stack' && slot.hidden.length ? [e.id, ...slot.hidden] : null,
        kfPinned: e.id === pinnedId,
        kfRepeat: !!e.repeat,
        kfHeld: e.held?.length ? e.held : null,
        kfFill: e.fill ?? null,
        kfParent: e.parent ?? null,
      }
      return ev
    }).concat(
      // §4 planning strip: the free stretches, behind the blocks (FullCalendar background events).
      (freeGaps ?? []).map((g, i) => ({ id: `kf-free-${i}`, title: g.label, start: g.start, end: g.end, display: 'background', classNames: ['kf-free'] })),
    )
    fcShared.current = shareEvents(fcShared.current, next)
    return fcShared.current.arr
    // `today` re-reads "overdue" when a new day starts.
  }, [events, isSpan, zone, shownDays, clockTime, conflictedIds, overlap, hour24, pinnedId, freeGaps, today]) // eslint-disable-line react-hooks/exhaustive-deps

  // M7: paging slides the days in from the side they come from — 160 ms, opacity and translate, on the
  // day columns only (never the time axis or the scroller). Off with Effects off / reduced motion (CSS).
  const slide = (dir: 'next' | 'prev') => {
    const w = wrapRef.current
    if (!w) return
    delete w.dataset.nav
    void w.offsetWidth
    w.dataset.nav = dir
    window.setTimeout(() => {
      if (w.dataset.nav === dir) delete w.dataset.nav
    }, 220)
  }
  useImperativeHandle(ref, () => ({
    unselect: () => fcRef.current?.getApi().unselect(),
    prev: () => {
      slide('prev')
      fcRef.current?.getApi().prev()
    },
    next: () => {
      slide('next')
      fcRef.current?.getApi().next()
    },
    gotoDate: (date) => {
      const api = fcRef.current?.getApi()
      if (!api) return
      // Already on screen (a block just planned this week): only the hours scroll to it.
      if (date < api.view.activeStart || date >= api.view.activeEnd) api.gotoDate(date)
      api.scrollToTime(scrollTimeNear(date, latest.current.props.scrollLeadMinutes ?? SCROLL_LEAD_DESKTOP_MIN))
    },
    // J-15: Today also brings the now-line back into view (FC's scroll API, never scrollIntoView,
    // which would scroll every ancestor too).
    today: () => {
      const api = fcRef.current?.getApi()
      if (!api) return
      const now = new Date()
      if (now < api.view.activeStart || now >= api.view.activeEnd) slide(now < api.view.activeStart ? 'prev' : 'next')
      api.today()
      api.scrollToTime(scrollTimeNear(new Date(), latest.current.props.scrollLeadMinutes ?? SCROLL_LEAD_DESKTOP_MIN))
    },
  }), [])

  // Where the last press on the grid was: `select` tells a click (one quarter) from a short drag by it.
  const downAt = useRef<{ x: number; y: number } | null>(null)

  // p7e A4: Ctrl-click an empty slot = a task there. FullCalendar starts no selection with Ctrl held (its
  // isPrimaryMouseButton), so the slot under the pointer is resolved here; ⌘ (a Mac) does select, and
  // `select` below reads the key. The slot's half hour, 30 minutes long (a whole day in the all-day band).
  function handleCtrlClick(e: React.MouseEvent) {
    if (!e.ctrlKey || e.metaKey || e.button !== 0 || (e.target as HTMLElement).closest('.fc-event, .fc-more-link, button, [role="button"]')) return
    const at = resolveGridDateTime(e.clientX, e.clientY)
    if (!at) return
    const end = new Date(Date.parse(at.iso) + (at.allDay ? 1440 : 30) * 60_000).toISOString()
    props.onCreate({ start: at.iso, end, allDay: at.allDay, x: e.clientX, y: e.clientY, task: true })
  }

  function handleGridContextMenu(e: React.MouseEvent) {
    if (!props.onGridContextMenu) return
    const target = e.target as HTMLElement
    if (target.closest('.fc-event')) return
    const resolved = resolveGridDateTime(e.clientX, e.clientY)
    if (!resolved) return
    e.preventDefault()
    props.onGridContextMenu(resolved.iso, resolved.allDay, e.clientX, e.clientY)
  }

  // ── FullCalendar's options, stable ──
  const views = useMemo(() => ({
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
  }), [dayCount])
  // Punch 32: 24-hour toggle drives both the block time rows and the gutter labels (lib/clock).
  // One range style (lib/clock clockRange): "10:00–10:30 AM", not FullCalendar's "10:00 AM - 10:30 AM".
  // FC hands the zoned wall clock (zonePlugin), so the hour and minute are the person's.
  const eventTimeFormat = useMemo(() => {
    const hm = (z: { hour: number; minute: number }) => `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`
    return (a: { start: { hour: number; minute: number }; end?: { hour: number; minute: number } }) => (a.end ? clockRange(hm(a.start), hm(a.end), hour24) : clockText(hm(a.start), hour24))
  }, [hour24])
  const slotLabelFormat = useMemo(() => (hour24 ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : { hour: 'numeric', hour12: true } as const), [hour24])
  const headerToolbar = useMemo(() => (hideToolbar ? false : { left: 'prev,next today', center: 'title', right: `timeGridDay,${customView},timeGridWeek,dayGridMonth` }), [hideToolbar])
  // J-15: land two hours above the now-line instead of a fixed 08:00. FC reads scrollTime once per
  // mount (each view switch remounts via `key`); prev/next keep the hour you're looking at, and Today
  // re-scrolls explicitly (the handle above).
  const [scrollTime] = useState(() => scrollTimeNear(new Date(), scrollLeadMinutes))

  const cb = useMemo(() => {
    const L = () => latest.current
    return {
      datesSet: (arg: DatesSetArg) => {
        L().props.onRangeChange?.({ title: arg.view.title, start: arg.view.currentStart, end: arg.view.currentEnd })
        const days = dayRange(zoneDateKey(arg.view.activeStart, L().zone), zoneDateKey(new Date(arg.view.activeEnd.getTime() - 1), L().zone))
        setShownDays((cur) => (cur && cur.join() === days.join() ? cur : days))
        if (arg.view.type !== 'dayGridMonth') setVisibleDays(Math.max(1, Math.round((arg.view.currentEnd.getTime() - arg.view.currentStart.getTime()) / 86_400_000)))
      },
      eventClassNames: (arg: EventContentArg): string[] => {
        // The minute's temporal class (LiveTime keeps it moving between renders) and the outbox marks,
        // so a re-render of the block by FullCalendar never drops them.
        const p = arg.event.extendedProps as Partial<BlockProps> & { kfSegOf?: string }
        if (arg.event.display === 'background' || p.kfSegOf || arg.isMirror || p.kfStart == null) return []
        const out: string[] = []
        if (!p.kfOverdue) {
          const c = phaseClass(phaseAt(p as BlockProps, arg.event.allDay, Date.now()))
          if (c) out.push(c)
        }
        if (L().pending.has(arg.event.id)) out.push('kf-pending')
        if (L().failed.has(arg.event.id)) out.push('kf-failed')
        return out
      },
      // 4c renders the title above the time. FC emits them the other way round, so own the
      // structure outright — that also gives task-linked blocks their checkbox (R4, 2026-07-20)
      // and finally puts real emoji in event titles (the last EmojiText gap from R4-4).
      eventContent: (arg: EventContentArg) => {
        if (arg.event.display === 'background') return <span className="kf-free-label">{arg.event.title}</span>
        // Calendar 3e: a span's day piece reads its own label ("Offsite »", "« »", "« ends 3 PM").
        if (arg.event.extendedProps.kfSegOf) {
          return (
            <div className="kf-ev-row" title={String(arg.event.extendedProps.kfTitle ?? '')}>
              <div className="kf-ev-text"><div className="fc-event-title"><EmojiText text={arg.event.title} /></div></div>
            </div>
          )
        }
        const { clockTime: clock } = L()
        const p = arg.event.extendedProps as BlockProps
        const done = !!p.kfTaskDone
        // S5: a month cell is a one-line pill — the title, nothing the time grid draws.
        if (arg.view.type === 'dayGridMonth') {
          return (
            <div className={`kf-ev-row${done ? ' kf-done' : ''}`}>
              <div className="kf-ev-text"><div className="fc-event-title"><EmojiText text={arg.event.title} /></div></div>
            </div>
          )
        }
        // A mirror (the drag-select preview, or a block mid-drag/resize) has no kf props of its own
        // — or the original block's — so its labels read the event's live times. Kai 2026-10-03:
        // a narrow column (150%) drew the preview's start-only label as clockTime(undefined),
        // "Invalid Date".
        const startMs = arg.event.start?.getTime() ?? p.kfStart
        const endMs = arg.event.end?.getTime() ?? p.kfEnd

        // §5 time labels that don't move with the minute (LiveTime adds "Ran over" / "Now · 51m left"), as the
        // options page's "Now" draws them (cal-looks): an hour or more reads its range and length ("9:00–10:00 AM ·
        // 1h"), less its range, a slot holding tasks its start. Overlapping and narrow blocks read the same (the
        // cascade leaves them the width); a one-line block (≤30m) shows none (CSS).
        const mins = Math.round((endMs - startMs) / 60_000)
        let staticTime: ReactNode = arg.timeText
        if (arg.timeText && p.kfHeld) staticTime = clock(startMs)
        else if (arg.timeText && mins >= 60) staticTime = `${arg.timeText} · ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`
        // The title wraps as far as the block holds over its time row (drawn px: 72 an hour, 7px padding, a
        // 15px title line, a 12.6px time row — the interface scale cancels out); a slot's title is one line.
        const lines = p.kfHeld ? 1 : Math.max(1, Math.floor((1.2 * mins - 25.8) / 15))
        const overdueTime = p.kfOverdue && !arg.isMirror && (
          // dragGuard: a click here opens the Plan menu instead of starting a drag or the details.
          <>
            <span className="kf-ev-overdue-word">Overdue · </span>
            <span
              className="kf-ev-replan"
              role="button"
              aria-label={`Replan ${arg.event.title}`}
              ref={(el) => {
                dragGuard(() => {
                  if (!el) return
                  const r = el.getBoundingClientRect()
                  L().props.onReplan?.(arg.event.id, r.left, r.bottom)
                })(el)
              }}
            >
              Replan
            </span>
          </>
        )
        // Calendar 3e "spans midnight": a piece cut at 00:00 names the far end at the cut (⌄ 1:30 AM /
        // ⌃ from 11 PM) instead of a time row; FullCalendar squares the cut corners (CalendarGrid.css).
        const cut = !arg.isMirror && !arg.event.allDay
        const cutInto = cut && !arg.isEnd ? '⌄ ' + clock(endMs) : null
        const cutFrom = cut && !arg.isStart ? '⌃ from ' + clock(startMs) : null

        // Month view has no shingle — its pills never trade the title for "+N more".
        const more = !arg.isMirror ? p.kfMore : null
        // §6: the topmost shingle reads "+N more" when blocks are fully hidden under it.
        // dragGuard: a tap here opens the list instead of starting a drag or eventClick.
        const moreLink = more && (
          <span
            className="kf-ev-more"
            role="button"
            aria-label={`${more.length - 1} more blocks here — show all`}
            ref={(el) => {
              dragGuard(() => {
                if (!el) return
                const r = el.getBoundingClientRect()
                setStackMore((cur) => (cur ? null : { ids: more, left: r.left, bottom: r.bottom }))
              })(el)
            }}
          >
            +{more.length - 1} more
          </span>
        )
        // Polish F2b: a just-dropped block on the top lane keeps its own title (that's what the
        // user must see); its "+N more" rides the time row until the pin lets go.
        const pinnedMore = !!(more && p.kfPinned)

        // §0 one badge slot, ranked: ⚠ (conflict) > ↻ repeating (C10). A done block is its filled check and
        // struck title, as drawn ("Now", cal-looks: no petal). A sync failure is the block's outline and its time
        // row's "retry ⚠" (CalendarGrid.css), off FullCalendar's data.
        const badge = p.kfConflict ? '⚠' : p.kfRepeat && !arg.isMirror ? 'repeat' : null
        const title = arg.event.title

        // The time row: the overdue link, else the minute's words, else the static label — then whose
        // subtask it is (Subtasks C) and the outbox's suffix (§7, CSS on .kf-ev-sync).
        const timeRow = (live: string | null) => {
          let timeText: ReactNode = overdueTime || live || staticTime
          if (cutInto || cutFrom) timeText = null
          if (p.kfParent && !arg.isMirror) timeText = <>{timeText}{timeText ? ' · ' : ''}↳ <EmojiText text={p.kfParent} /></>
          if (pinnedMore) return <div className="fc-event-time">{timeText ? <>{timeText} · </> : ''}{moreLink}<span className="kf-ev-sync" /></div>
          return timeText ? <div className="fc-event-time">{timeText}<span className="kf-ev-sync" /></div> : null
        }

        return (
          <div className={`kf-ev-row${done ? ' kf-done' : ''}`} data-tour={arg.isMirror ? undefined : 'calendar-block'}>
            {badge === '⚠' && <span className="kf-ev-badge" title="Overlaps another block">⚠</span>}
            {badge === 'repeat' && <span className="kf-ev-badge kf-ev-repeat" title="Repeats"><Icon name="repeat" size={10} label="Repeats" /></span>}
            {/* Selected B (Kai 2026-10-23): a picked block's check badge — shown by [data-picked], set off FullCalendar's data. */}
            {!arg.isMirror && <span className="kf-ev-pick" aria-hidden="true">✓</span>}
            {cutFrom && <span className="fc-event-time kf-ev-cut kf-ev-cut-from">{cutFrom}</span>}
            {cutInto && <span className="fc-event-time kf-ev-cut kf-ev-cut-into">{cutInto}</span>}
            {p.kfTaskId && !arg.isMirror && (
              <span
                className={`kf-ev-check${done ? ' kf-on' : ''}`}
                role="checkbox"
                aria-checked={done}
                aria-label={`${done ? 'Reopen' : 'Complete'} ${arg.event.title}`}
                ref={dragGuard(() => L().props.onCompleteTask?.(p.kfTaskId!, done))}
              >
                {done ? '✓' : ''}
              </span>
            )}
            <div className="kf-ev-text">
              {more && !pinnedMore ? (
                <div className="fc-event-title" title={title}>{moreLink}</div>
              ) : (
                <div className="fc-event-title" style={{ WebkitLineClamp: lines }}>
                  {p.kfGoal && <span className="kf-ev-star" aria-label="Goal of the day: ">✶ </span>}
                  <EmojiText text={title} />
                </div>
              )}
              {arg.isMirror ? timeRow(null) : (
                <LiveTime p={p} allDay={arg.event.allDay} overdue={!!p.kfOverdue} clock={clock}>
                  {timeRow}
                </LiveTime>
              )}
              {/* Time Slots (0073): the tasks the slot holds, each with its checkbox, × (hover: Out of
                  the slot) and ⋯ — all dragGuard'd, so ticking or opening one never moves the slot.
                  The row itself drags the task out (heldRow). */}
              {p.kfHeld && !arg.isMirror && (
                <div className="kf-ev-slot">
                  <div className="fc-event-time kf-ev-fill">{p.kfFill}</div>
                  {p.kfHeld.map((h) => (
                    <div key={h.id} ref={heldRow} className={`kf-ev-slot-row${h.done ? ' kf-done' : ''}`} data-slot-task={h.id} data-task-id={h.id} data-title={h.title} data-duration={h.minutes} data-length={durationLabel(h.minutes)}>
                      <span
                        className={`kf-ev-check${h.done ? ' kf-on' : ''}`}
                        role="checkbox"
                        aria-checked={h.done}
                        aria-label={`${h.done ? 'Reopen' : 'Complete'} ${h.title}`}
                        ref={dragGuard(() => L().props.onCompleteTask?.(h.id, h.done))}
                      >
                        {h.done ? '✓' : ''}
                      </span>
                      <span className="fc-event-title kf-ev-slot-title"><EmojiText text={h.title} /></span>
                      <span className="kf-ev-slot-out" role="button" aria-label={`Out of the slot: ${h.title}`} title="Out of the slot" ref={dragGuard(() => L().props.onSlotTaskOut?.(h.id))}>
                        ×
                      </span>
                      <span
                        className="kf-ev-slot-more"
                        role="button"
                        aria-label={`More for ${h.title}`}
                        ref={(el) => {
                          dragGuard(() => {
                            if (!el) return
                            const r = el.getBoundingClientRect()
                            L().props.onSlotTaskMenu?.(h.id, r.left, r.bottom)
                          })(el)
                        }}
                      >
                        ⋯
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* "Now" as drawn: the pointer over a block shows its actions on the title's line — ▶ Focus on a
                task, ⋯ its menu (the right-click one). dragGuard: a press here never starts a drag. Touch
                reaches both through the block's popover and its long-press menu. */}
            {!arg.isMirror && (
              <span className="kf-ev-acts">
                {p.kfTaskId && !done && !arg.event.allDay && (
                  <span role="button" className="kf-ev-act" title="Focus" aria-label={`Focus on ${title}`} ref={dragGuard(() => L().props.onFocusTask?.(p.kfTaskId!))}>
                    ▶
                  </span>
                )}
                <span
                  role="button"
                  className="kf-ev-act"
                  title="More"
                  aria-label={`More for ${title}`}
                  ref={(el) => {
                    dragGuard(() => {
                      if (!el) return
                      const r = el.getBoundingClientRect()
                      L().props.onEventContextMenu?.(blockIdOf(arg.event), r.left, r.bottom)
                    })(el)
                  }}
                >
                  ⋯
                </span>
              </span>
            )}
          </div>
        )
      },
      eventDidMount: (info: EventMountArg) => {
        if (info.event.display === 'background') return // §4's free stretches: not a block
        // Polish F2b: lets the pin's "next interaction" listener tell a press on the pinned block
        // itself (keep it) from a press anywhere else (let go).
        const id = blockIdOf(info.event)
        info.el.dataset.kfId = id
        info.el.toggleAttribute('data-picked', L().pickedIds.includes(id))
        paintColor(info.el, (info.event.extendedProps as { kfColor?: string | null })?.kfColor)
        // Punch 34: double-click goes straight to the task editor (single click still opens
        // the details popover — the navigation unmounts it, so the two don't fight).
        info.el.addEventListener('dblclick', () => L().props.onEventDoubleClick?.(id))
        info.el.addEventListener('contextmenu', (e: MouseEvent) => {
          if (!L().props.onEventContextMenu) return
          e.preventDefault()
          L().props.onEventContextMenu?.(id, e.clientX, e.clientY)
        })
      },
      select: (info: DateSelectArg) => {
        const jsEvent = info.jsEvent as MouseEvent | null
        const from = downAt.current
        const dragged = !!(jsEvent && from && Math.abs(jsEvent.clientX - from.x) + Math.abs(jsEvent.clientY - from.y) > 3)
        L().props.onCreate({ start: info.startStr, end: info.endStr, allDay: info.allDay, x: jsEvent?.clientX ?? window.innerWidth / 2, y: jsEvent?.clientY ?? window.innerHeight / 2, task: !!jsEvent?.metaKey, dragged })
      },
      eventClick: (info: EventClickArg) => {
        if (info.event.display === 'background') return
        const e = info.jsEvent as MouseEvent
        L().props.onEventClick(blockIdOf(info.event), e.ctrlKey || e.metaKey || e.shiftKey)
      },
      // Motion 4c: the free ghost lives for the duration of the drag; the snapping placeholder
      // is FC's own mirror. eventDragStop fires before eventDrop.
      eventDragStart: (info: EventDragStartArg) => {
        // Whoever drags a block knows it: the one-time "Drag a block to move it" hint never shows after
        // (it used to land 1.5 s after the first drag, over the block the next one reached for).
        markSeen('hint:calendar')
        landingRef.current?.stop()
        stopGhostRef.current = startGhost(info.el, info.jsEvent as MouseEvent | null)
        stopHoverRef.current = trackRailHover(L().props.railRef?.current)
      },
      eventDragStop: (info: EventDragStopArg) => {
        const stop = stopGhostRef.current
        stopGhostRef.current = null
        stopHoverRef.current?.()
        stopHoverRef.current = null
        const je = info.jsEvent as MouseEvent | null
        const contains = (el: Element | null | undefined) => {
          if (!el || !je) return false
          const r = el.getBoundingClientRect()
          return je.clientX >= r.left && je.clientX <= r.right && je.clientY >= r.top && je.clientY <= r.bottom
        }
        // The pointer left the grid, so FC reverts (instantly, dragRevertDuration 0).
        // Rail = the section under the pointer decides (punch 33, Kai 2026-10-12); anywhere else
        // = §7 invalid drop → the soft-no: the ghost shakes ±4px decaying ~320ms, nothing changes.
        if (je && wrapRef.current && !contains(wrapRef.current)) {
          const rail = L().props.railRef?.current
          const section = rail && contains(rail) ? (railSectionAt(rail, je.clientX, je.clientY)?.dataset.section ?? null) : undefined
          const handled = section !== undefined && (L().props.onDragToRail?.(info.event.id, section) ?? false)
          if (!handled) {
            const host = document.getElementById(GHOST_ID)
            if (host) {
              host.classList.add('kf-cal-softno')
              window.setTimeout(() => stop?.(), 340)
              return
            }
          }
          stop?.()
          return
        }
        // S2 + M1: over the grid the ghost stays up for the drop to settle it where the block lands (an
        // unchanged drop fires no eventDrop — the timer lets it go).
        if (!stop) return
        const landing = { stop, host: document.getElementById(GHOST_ID), timer: 0 }
        landing.timer = window.setTimeout(() => {
          if (landingRef.current === landing) landingRef.current = null
          stop()
        }, 400)
        landingRef.current = landing
      },
      eventDrop: (info: EventDropArg) => {
        const landing = landingRef.current
        landingRef.current = null
        if (landing) window.clearTimeout(landing.timer)
        const id = info.event.id
        // Multi-select: a picked block dragged carries the other picked blocks by the same amount.
        const picked = L().pickedIds
        let handled = false
        if (picked.length > 1 && picked.includes(id) && info.event.start && info.oldEvent.start && !info.event.allDay && !info.oldEvent.allDay) {
          handled = !!L().props.onMoveMany?.(picked, info.event.start.getTime() - info.oldEvent.start.getTime())
        }
        if (!handled && info.event.start) {
          // Crossing the all-day boundary nulls the end (FC convention) — restate a real one:
          // a converted all-day block spans its day; a re-timed chip gets the default hour.
          const allDay = info.event.allDay
          const end = info.event.end ?? new Date(info.event.start.getTime() + (allDay ? 86_400_000 : 3_600_000))
          L().props.onMove(id, info.event.start.toISOString(), end.toISOString(), allDay)
        }
        setPinnedId(id) // Polish F2b: where it landed stays in view
        if (landing) settleGhost(landing, id, !!wrapRef.current?.closest('.cal-motion-on'))
      },
      // While resizing, FC keeps the original chip visible under the mirror — with both drawn
      // the overlap reads as a dark doubled rectangle. Hide the original for the duration.
      eventResizeStart: (info: EventResizeStartArg) => { info.el.style.visibility = 'hidden' },
      eventResizeStop: (info: EventResizeStopArg) => { info.el.style.visibility = '' },
      eventResize: (info: EventResizeDoneArg) => {
        if (info.event.start && info.event.end) {
          // §7 resizing: min 15 min — one snap (Kai 2026-10-21: "we cant have a task of 15 mins", the
          // old 30 here pulled a 15-minute resize back). Clamp on the edge that moved — a top-edge
          // (start) resize pushes the start back up; a bottom-edge resize pulls the end back down.
          let startMs = info.event.start.getTime()
          let endMs = info.event.end.getTime()
          const MIN = 15 * 60_000
          if (!info.event.allDay && endMs - startMs < MIN) {
            const startMoved = info.startDelta.milliseconds !== 0 || info.startDelta.days !== 0
            if (startMoved) startMs = endMs - MIN
            else endMs = startMs + MIN
          }
          setPinnedId(info.event.id) // Polish F2b: a resize into a stack stays in view too
          L().props.onResize(info.event.id, new Date(startMs).toISOString(), new Date(endMs).toISOString())
        }
      },
      drop: (info: DropArg) => {
        const { taskId, inboxId } = info.draggedEl.dataset
        if (!(taskId || inboxId) || !info.date) return
        L().props.onExternalDrop({ taskId, inboxId }, info.date.toISOString(), info.allDay)
      },
    }
  }, [heldRow])

  // The day headers and the now chip change with the day and the clock, so they're rebuilt then only.
  const dayHeaderContent = useCallback((arg: DayHeaderContentArg) => {
    if (latest.current.strip) {
      const day = headerDay(arg.date, new Date())
      return <div className={`cal-strip-dayhead${day.delta === 0 ? ' is-today' : ''}`}>{day.weekday}{day.delta === 0 ? ' · Today' : ''}</div>
    }
    // Month view's header row is one cell per weekday, not per date — no daisy, no number.
    if (arg.view.type === 'dayGridMonth') {
      return <div className="cal-day-header-month">{arg.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: latest.current.zone })}</div>
    }
    // Punch 39 — WA2 contract "Day headers with daisy": past column past.png 26px + cell
    // opacity .62 · today = clock stage 30px + shadow-drop-sm + lavender + "Fri · Today" ·
    // future = future.png 26px. Stages come from lib/growthStages (never re-bucketed here).
    // J-15: arg.date is a real local-midnight Date, read with local getters (gridClock.ts
    // explains how the old getUTC* read put "Today" one column late east of Greenwich).
    const now = new Date()
    const day = headerDay(arg.date, now)
    const stage = daisyColumnStage(day.delta, zoneHour(now)) // the user's clock, not the device's
    const isToday = day.delta === 0
    return (
      <div className={`cal-day-header${isToday ? ' cal-day-header-today' : ''}${stage === 'past' ? ' cal-day-header-past' : ''}`}>
        <img src={`/ds/assets/daisy/${stage}.png`} alt="" className="cal-day-daisy" />
        <div>
          <div className="cal-day-header-name">
            {day.weekday}
            {isToday ? ' · Today' : ''}
          </div>
          <div className="cal-day-header-num">{day.day}</div>
        </div>
      </div>
    )
  }, [strip, zone, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // Calendar.dc.html:213 — live mono time chip riding the now line; FC's NowTimer re-renders this every
  // minute, so no interval of our own. R4 (2026-07-20): `arg.date` is a FullCalendar DateMarker —
  // wall-clock encoded AS UTC — so read the real clock instead of the marker.
  const nowIndicatorContent = useCallback((arg: NowIndicatorContentArg) => (arg.isAxis ? null : <span className="cal-now-chip">{clockTime(Date.now())}</span>), [clockTime])
  const allDaySlot = useMemo(() => !strip || events.some((e) => e.allDay || isSpan(e)), [strip, events, isSpan])
  const wrapStyle = useMemo(
    () => ({ height: '100%', minWidth: gridMinWidth(visibleDays), ['--kf-cal-density' as string]: density === 's' ? 0.8 : density === 'l' ? 1.2 : 1 }) as React.CSSProperties,
    [visibleDays, density],
  )

  return (
    // MIN_COL_W per day column + the time axis: below that the grid scrolls horizontally in the
    // page's scroller instead of crushing the last day into a sliver. Polish D: that floor was
    // 170px — §6's narrow-column THRESHOLD, not a floor — so at the default 125% zoom a 1280px
    // window showed two days of seven. Between MIN_COL_W and 170 a column now draws §6's narrow
    // tier (`kf-cal-narrow`: short-tier type scale, start time only). weekFit.ts has the numbers.
    // --kf-cal-density folds the view-options Density into the --s scale (CalendarGrid.css);
    // it's also in the FC key because slot geometry is measured once per mount.
    <div
      ref={wrapRef}
      data-tour="calendar"
      className={narrow ? 'kf-cal-narrow' : undefined}
      onContextMenu={handleGridContextMenu}
      onClick={handleCtrlClick}
      onMouseDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY } }}
      style={wrapStyle}
    >
    <FullCalendar
      key={`${initialView}-${dayCount}-${density}`}
      ref={fcRef}
      plugins={PLUGINS}
      timeZone={zone}
      initialView={initialView}
      firstDay={firstDay}
      hiddenDays={hiddenDays}
      // Punch 35: top-edge resize — start moves, end stays put. FC's own start handle.
      eventResizableFromStart
      // Punch 33/35: an off-grid drop reverts instantly (rail handles deletion, soft-no shakes);
      // the default 500ms glide-back would fight both.
      dragRevertDuration={0}
      eventTimeFormat={eventTimeFormat}
      slotLabelFormat={slotLabelFormat}
      views={views}
      headerToolbar={headerToolbar}
      datesSet={cb.datesSet}
      height="100%"
      scrollTime={scrollTime}
      scrollTimeReset={false}
      // Motion 4c "Calendar drag dialect · snap": "30-min grid in the real view". Both were
      // relying on FullCalendar's defaults happening to be 30min — state the contract instead,
      // so the placeholder steps in half-hours and a drag can't land on an off-grid time.
      // Kai 2026-10-03: drags, moves and resizes land on quarter hours (the time fields' own
      // 15-min list); the drawn grid stays half-hourly. A plain click still makes 30 min
      // (CalendarPage.handleGridCreate widens a one-snap selection).
      slotDuration="00:30:00"
      snapDuration="00:15:00"
      // Punch 37: edge auto-scroll while dragging is FC's own AutoScroller — enabled by default,
      // wired to `.fc-scroller` (the time-grid's vertical scroller), 50px edge zone, quadratic
      // ramp to a gentle 300px/s. Stated explicitly so nobody "cleans it up" to false.
      dragScroll
      // S5: a month cell draws three pills and "+N more" (every pill cost the whole view 2 s to open);
      // the time grid keeps FullCalendar's own fit.
      dayMaxEvents={initialView === 'dayGridMonth' ? 3 : true}
      allDayText="All day"
      // §4 strip: one day needs no day row; two read "FRI · TODAY" in mono. No empty all-day band.
      dayHeaders={!strip || visibleDays > 1}
      allDaySlot={allDaySlot}
      dayHeaderContent={dayHeaderContent}
      nowIndicator
      nowIndicatorContent={nowIndicatorContent}
      // M1b: on touch, a 400ms hold picks up a block or starts a slot selection — the DS long-press
      // (DS-CHANGELOG §3). FullCalendar's 1000ms default read as "nothing happens".
      longPressDelay={400}
      eventLongPressDelay={400}
      selectLongPressDelay={400}
      selectable
      selectMirror
      // Kai 2026-07-21: "when I change the type the ghost highlight dissapears" — clicking
      // anything in our own popover counts as a click outside the grid, so FC unselectAuto
      // wiped the slot highlight. Exempt the popover from it.
      unselectCancel=".kf-quickcreate"
      editable
      droppable
      events={fcEvents}
      eventClassNames={cb.eventClassNames}
      eventContent={cb.eventContent}
      eventDidMount={cb.eventDidMount}
      select={cb.select}
      eventClick={cb.eventClick}
      eventDragStart={cb.eventDragStart}
      eventDragStop={cb.eventDragStop}
      eventDrop={cb.eventDrop}
      eventResizeStart={cb.eventResizeStart}
      eventResizeStop={cb.eventResizeStop}
      eventResize={cb.eventResize}
      drop={cb.drop}
    />
    {stackMore && (
      <StackMorePopover
        anchor={stackMore}
        items={stackMore.ids.flatMap((id) => {
          const e = events.find((x) => x.id === id)
          return e ? [{ id, title: e.title, time: timeRange(new Date(e.start), new Date(e.end), zone, hour24) }] : []
        })}
        onPick={props.onEventClick}
        onClose={closeStackMore}
      />
    )}
    </div>
  )
}))
