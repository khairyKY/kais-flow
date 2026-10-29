import { forwardRef, memo, startTransition, useCallback, useEffect, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { timeRange, zoneHour, zoneShort, zoneTimeKey, zoneToIso } from './eventTime'
import { appZone, useAppZone } from '../../lib/appZone'
import { clockOptions, clockRange, clockText } from '../../lib/clock'
import { useMinuteClock } from '../../lib/minuteClock'
import { intlZonePlugin } from './zonePlugin'
import { headerDay, scrollTimeNear, SCROLL_LEAD_DESKTOP_MIN } from './gridClock'
import { gridMinWidth, isNarrow, TIME_AXIS_W, ZONE2_W } from './weekFit'
import { StackMorePopover } from './StackMorePopover'
import { useDayRollover } from './useDayRollover'
import { CARD_DRAG, liftCards } from './cardDrag'
import { blockHue } from './blockHue'
import { repeatCheckName } from './blockMenuSpec'
import { RepeatGlyph, Tick } from './checkGlyphs'
import { EASE_OUT, markTicked, ownArrival, takeTicked } from './blockMotion'
import { playOnce, reducedMotionNow } from '../../lib/motion'
import { attachGlide, type Glide } from './gridGlide'
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
  /** The task's repeat rule (RRULE), when it repeats — repeat B draws its box as two chasing arrows (cal-blocks). */
  taskRepeat?: string | null
  /** One occurrence of a repeating event (CALENDAR-BLOCK-STATES C10): the ↻ badge. */
  repeat?: boolean
  /** A Time block's tasks (Time Slots, 0073), drawn as rows inside it, and its "2 tasks · 45m of 2h". */
  held?: { id: string; title: string; done: boolean; minutes: number }[]
  fill?: string
  /** "45m over" when its tasks outrun it (./slots slotOver). */
  over?: string | null
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
  /** allDay flips when a drag crosses the all-day band ↔ time grid boundary (CALENDAR.md §6). `revert` puts the
   * block back where it was (cal-clicks: the scope question's Cancel / Esc). */
  onMove: (id: string, start: string, end: string, allDay: boolean, revert?: () => void) => void
  onResize: (id: string, start: string, end: string, revert?: () => void) => void
  /** `add`: with Ctrl / ⌘ / Shift held — the block joins (or leaves) the multi-selection. */
  onEventClick: (id: string, add?: boolean) => void
  /** Multi-select (Kai 2026-10-22): the picked blocks, outlined; dragging one of them moves them all. */
  pickedIds?: readonly string[]
  /** The picked blocks moved by the dragged one's delta — true when handled. */
  onMoveMany?: (ids: readonly string[], deltaMs: number) => boolean
  /** Ctrl+drag (menu B, cal-blocks): a copy of the block lands here, the original stays — true when handled
   * (false: it can't be copied, e.g. a Time block — the soft-no). */
  onDuplicateAt?: (id: string, start: string, end: string, allDay: boolean) => boolean
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
  /** cal-wave (Akiflow's "Dynamic"): the first and last hour drawn ("HH:MM:SS"), the rows stretched to
   * the grid's height. Absent = the whole day at the density's row height. */
  slotMinTime?: string
  slotMaxTime?: string
  expandRows?: boolean
  /** cal-wave: a second clock in the time gutter — its zone (IANA), or none. */
  secondZone?: string | null
  /** CAL11: the block whose popover (its details, menu B, its task's popover) is open — outlined in its ink. */
  selectedId?: string | null
  /** cal-scroll: the days' sideways offset (FullCalendar's px — the screen's), every frame they glide — the day tray follows it. */
  onGlide?: (x: number) => void
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
  rail.dataset.dragging = '' // cal-wave: the rail's empty sections come back as drop targets meanwhile
  let over: HTMLElement | null = null
  // CAL9 / S11: one look a frame, and a hit test only while the pointer is over the rail.
  let raf = 0
  let at = { x: 0, y: 0 }
  const look = () => {
    raf = 0
    const r = rail.getBoundingClientRect()
    const inside = at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom
    const sec = inside ? railSectionAt(rail, at.x, at.y) : null
    if (sec === over) return
    over?.removeAttribute('data-drop-over')
    sec?.setAttribute('data-drop-over', '')
    over = sec
  }
  const move = (e: MouseEvent) => {
    at = { x: e.clientX, y: e.clientY }
    if (!raf) raf = requestAnimationFrame(look)
  }
  window.addEventListener('mousemove', move)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('mousemove', move)
    over?.removeAttribute('data-drop-over')
    // after the drop has read the section under the pointer (the callers hit-test right after this)
    requestAnimationFrame(() => delete rail.dataset.dragging)
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

/** The instant a date key's day starts on `zone`'s clock. */
function zoneDayStart(key: string, zone: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.parse(zoneWallTimeToIso(zone, y, m, d))
}

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

/** A ghost in hand. `release` lets go of the pointer (it stops following, tilting and trailing) and keeps the ghost up
 * for its settle; `stop` takes it down. */
type Ghost = { stop: () => void; release: () => void; host: HTMLElement | null }

/** `id`: the grabbed block's ghost carries GHOST_ID; a multi-drag's other blocks (cal-blocks, item 10) get their
 * own, unnamed — each placed from its own block, so it keeps its offset from the grabbed one under the pointer.
 * `tilt` (D3, Kai's yes; Effects on): it leans with the pointer's sideways speed, up to ±6° and back upright the
 * moment the hand stops, a faint copy trailing it — the wobble stays underneath. */
function startGhost(source: HTMLElement, ev: MouseEvent | null, id: string | null = GHOST_ID, from?: { x: number; y: number } | null, tilt = false): Ghost {
  if (typeof document === 'undefined') return { stop: () => {}, release: () => {}, host: null }
  const rect = source.getBoundingClientRect()

  // The ghost lives on <body> so `position: fixed` is always viewport-relative (a transformed
  // ancestor inside the grid would otherwise become its containing block — the mispositioning
  // bug the 2026-07-19 audit already paid for once). But every block rule is scoped `.fc ...`,
  // so a bare clone on <body> matched none of them and fell back to FullCalendar's own unscoped
  // `.fc-v-event`, whose --fc-event-bg-color defaults to #3788d8 — Kai's "it turns all blue".
  // Wrapping the clone in a `.fc` host restores the scope without moving it off <body>.
  const host = document.createElement('div')
  if (id) host.id = id
  host.className = source.closest('.cal-motion-on') ? 'fc cal-motion-on kf-ghost-host' : 'fc kf-ghost-host'
  host.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:70;'

  const ghost = source.cloneNode(true) as HTMLElement
  ghost.className = `${source.className} kf-cal-ghost`
  // It keeps the block's data-kf-id (whose ghost it is); every lookup by id that changes a block is scoped to the grid.
  for (const a of ['data-selected', 'data-landed', 'data-landing']) ghost.removeAttribute(a)
  // Size and neutralise the grid placement WITHOUT cssText, which would wipe the inline
  // --kf-ev-* custom properties eventDidMount sets for a coloured event.
  ghost.style.position = 'relative'
  ghost.style.inset = 'auto'
  ghost.style.margin = '0'
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  host.appendChild(ghost)
  document.body.appendChild(host)

  // Grab offset keeps the ghost under the same spot on the block the pointer picked up — measured from the press
  // (`from`), not from the move that crossed FullCalendar's drag threshold, so the ghost doesn't lag the pointer.
  const at = from ?? (ev ? { x: ev.clientX, y: ev.clientY } : null)
  const grabX = at ? at.x - rect.left : rect.width / 2
  const grabY = at ? at.y - rect.top : rect.height / 2
  const pos = { x: rect.left, y: rect.top }
  // D3: the lean, from the pointer's sideways speed (px/ms), eased toward upright every frame.
  let lean = 0
  let lastX = at?.x ?? 0
  let lastT = performance.now()
  // The host carries the position so the ghost itself keeps the 2c wobble on its own transform.
  const move = (e: MouseEvent) => {
    pos.x = e.clientX - grabX
    pos.y = e.clientY - grabY
    host.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    if (!tilt) return
    const t = performance.now()
    lean = Math.max(-6, Math.min(6, lean * 0.6 + ((e.clientX - lastX) / Math.max(8, t - lastT)) * 5))
    lastX = e.clientX
    lastT = t
  }
  if (ev) move(ev)
  window.addEventListener('mousemove', move)
  window.addEventListener('dragover', move as EventListener)

  let raf = 0
  let trail: HTMLElement | null = null
  if (tilt) {
    trail = host.cloneNode(true) as HTMLElement
    trail.removeAttribute('id')
    trail.className = host.className.replace('kf-ghost-host', 'kf-ghost-trail') // not a ghost: a copy, nothing counts it
    trail.firstElementChild?.removeAttribute('data-kf-id')
    trail.style.opacity = '0.22'
    trail.style.zIndex = '69'
    document.body.insertBefore(trail, host)
    const copy = trail.firstElementChild as HTMLElement
    const tp = { ...pos }
    const frame = () => {
      lean *= 0.86
      ghost.style.rotate = `${lean.toFixed(2)}deg`
      tp.x += (pos.x - tp.x) * 0.18
      tp.y += (pos.y - tp.y) * 0.18
      trail!.style.transform = `translate(${tp.x}px, ${tp.y}px)`
      copy.style.rotate = `${(lean * 0.6).toFixed(2)}deg`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
  }

  const release = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('dragover', move as EventListener)
    cancelAnimationFrame(raf)
    trail?.remove()
    trail = null
  }
  return {
    host,
    release,
    stop: () => {
      release()
      host.remove()
    },
  }
}

/** A multi-drag's other picked blocks (cal-blocks, item 10): each one's ghost, and its block left faded in place. */
type Carried = { id: string; stop: () => void; host: HTMLElement | null }

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
  kfOverdue: boolean; kfConflict: boolean; kfGoal: boolean; kfTaskRepeat: string | null
  kfMore: string[] | null; kfPinned: boolean; kfRepeat: boolean
  kfHeld: { id: string; title: string; done: boolean; minutes: number }[] | null; kfFill: string | null; kfOver: string | null; kfParent: string | null
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

const blockSel = (id: string) => `.fc-event[data-kf-id="${CSS.escape(id)}"]:not(.fc-event-mirror)`
type Landing = { stop: () => void; host: HTMLElement | null }

/** M1 / M8: the just-landed ring (§7, 300 ms) on a block — or a Time slot's row — that arrived: dropped, created,
 * restored. An attribute on its element, never FullCalendar's data (no repaint). */
function ring(el: HTMLElement): void {
  el.removeAttribute('data-landed')
  void el.offsetWidth // restart the animation
  el.setAttribute('data-landed', '')
  window.setTimeout(() => el.removeAttribute('data-landed'), 340)
}
const landRing = (root: ParentNode, id: string): void => root.querySelectorAll<HTMLElement>(blockSel(id)).forEach(ring)

/** CAL14: the ghost eases onto `r` — its place (the host) and its lift, lean, wobble, shadow and size (the ghost),
 * from wherever they are this frame — over `ms` on --ease-out. `out`: it fades as it goes (folding into the rail). */
function glide(host: HTMLElement, ghost: HTMLElement, r: DOMRect, ms: number, out = false): void {
  const g = getComputedStyle(ghost)
  const from = { transform: g.transform, scale: g.scale, rotate: g.rotate, boxShadow: g.boxShadow, width: g.width, height: g.height, opacity: g.opacity }
  ghost.getAnimations().forEach((a) => a.cancel())
  ghost.classList.add('kf-cal-ghost-settle')
  ghost.animate([from, { transform: 'none', scale: '1', rotate: '0deg', boxShadow: 'none', width: `${r.width}px`, height: `${r.height}px`, opacity: out ? 0 : 1 }], { duration: ms, easing: EASE_OUT, fill: 'forwards' })
  host.style.transition = `transform ${ms}ms ${EASE_OUT}`
  host.style.transform = `translate(${r.left}px, ${r.top}px)`
}

/** S2 + M1 (2026-10-22 audit), CAL1, CAL2: the ghost stays up until what now stands for the block has painted (kept
 * hidden meanwhile, `data-landing`) — the block where it was dropped, the copy a Ctrl+drag made, the row of the Time
 * slot it went into, the block it rides home to — then settles onto it (160 ms) and goes; the arrival wears the
 * just-landed ring. With Effects off or reduced motion it just goes once that's there. `hide`: a block to keep out
 * of sight meanwhile when the target is something else (a task block going into a slot). */
function settleGhost(root: ParentNode, landing: Landing, target: string | (() => HTMLElement | null), motion: boolean, o: { ms?: number; ring?: boolean; hide?: string } = {}): void {
  const ms = o.ms ?? 160
  const hide = o.hide ?? (typeof target === 'string' ? target : null)
  const find = typeof target === 'string' ? () => root.querySelector<HTMLElement>(blockSel(target)) : target
  const mark = (on: boolean) => {
    if (hide) root.querySelectorAll<HTMLElement>(blockSel(hide)).forEach((el) => el.toggleAttribute('data-landing', on))
  }
  let el: HTMLElement | null = null
  const finish = () => {
    mark(false)
    el?.removeAttribute('data-landing')
    landing.stop()
    if (motion && el && o.ring !== false) ring(el)
  }
  mark(true)
  let tries = 0
  const look = () => {
    mark(true) // FullCalendar may have drawn a new element meanwhile
    el = find()
    // A copy, a detached occurrence or a slot's row is drawn a render or two after the drop: a few frames for it.
    if (!el && motion && ++tries < 12) return void requestAnimationFrame(look)
    const host = landing.host
    const ghost = host?.firstElementChild as HTMLElement | null
    if (!el || !host || !ghost || !motion || reducedMotionNow()) return finish()
    el.setAttribute('data-landing', '')
    glide(host, ghost, el.getBoundingClientRect(), ms)
    window.setTimeout(finish, ms + 10)
  }
  requestAnimationFrame(() => requestAnimationFrame(look))
}

/** §7 the soft-no on a refused drop — each ghost shakes and dims (320 ms) — then CAL2: it rides home to its block
 * (--dur-ghost-home, 380 ms), which stays out of sight until it's there. Effects off: they go after the shake. */
function refuse(root: ParentNode, ghosts: readonly (Landing & { id: string })[], motion: boolean): void {
  for (const g of ghosts) {
    g.host?.classList.add('kf-cal-softno')
    if (motion) root.querySelectorAll<HTMLElement>(blockSel(g.id)).forEach((el) => el.setAttribute('data-landing', ''))
  }
  window.setTimeout(() => {
    for (const g of ghosts) {
      if (motion) settleGhost(root, g, g.id, true, { ms: 380, ring: false })
      else g.stop()
    }
  }, 340)
}

/** CAL1 (a block dragged onto the rail): FullCalendar has put the block back at its old slot — never shown there.
 * The ghost folds into its task's row in the rail (200 ms) and the row breathes in, as Akiflow folds a block back
 * into its list; with no row in sight it folds away where it is. */
function foldIntoRail(root: ParentNode, ghost: Ghost, id: string, rail: HTMLElement, taskId: string | null, motion: boolean): void {
  root.querySelectorAll<HTMLElement>(blockSel(id)).forEach((el) => el.setAttribute('data-landing', ''))
  const host = ghost.host
  const g = host?.firstElementChild as HTMLElement | null
  if (!motion || reducedMotionNow() || !host || !g) return ghost.stop()
  let tries = 0
  const look = () => {
    const row = taskId ? rail.querySelector<HTMLElement>(`.unscheduled-task[data-task-id="${CSS.escape(taskId)}"]`) : null
    if (!row && ++tries < 12) return void requestAnimationFrame(look)
    glide(host, g, (row ?? g).getBoundingClientRect(), 200, true)
    row?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 80, easing: EASE_OUT, fill: 'backwards' })
    window.setTimeout(ghost.stop, 210)
  }
  requestAnimationFrame(look)
}

/** D4 (Kai's yes, decorative): while a block is dragged, each step the placeholder takes flashes its top edge once —
 * a 1.5 px lavender-deep line, 120 ms (Motion 4c's calSnapLine, rebuilt on the DOM). One look a frame, at most. */
function watchSnaps(wrap: HTMLElement): () => void {
  const line = getComputedStyle(wrap).getPropertyValue('--acc-lavender-deep').trim()
  let at = ''
  let raf = 0
  const look = () => {
    raf = 0
    const m = wrap.querySelector<HTMLElement>('.fc-event-mirror')
    if (!m) return void (at = '')
    const r = m.getBoundingClientRect()
    const here = `${Math.round(r.left)}|${Math.round(r.top)}`
    if (at && here !== at) m.animate([{ boxShadow: '0 -1.5px 0 transparent' }, { boxShadow: `0 -1.5px 0 ${line}`, offset: 0.3 }, { boxShadow: '0 -1.5px 0 transparent' }], { duration: 120, easing: EASE_OUT })
    at = here
  }
  const move = () => {
    if (!raf) raf = requestAnimationFrame(look)
  }
  window.addEventListener('mousemove', move)
  return () => {
    window.removeEventListener('mousemove', move)
    cancelAnimationFrame(raf)
  }
}

/** D4: a resize's free stretch — FullCalendar's placeholder steps per quarter; its edge follows the pointer instead
 * (a margin on its harness, at most once a frame), kept where it was grabbed. `onFree` hears the edge's place. */
function stretchFreely(wrap: HTMLElement, block: HTMLElement, edge: 'start' | 'end', down: MouseEvent, onFree: (free: { top: number; bottom: number }) => void): () => void {
  const b = block.getBoundingClientRect()
  const grab = (edge === 'end' ? b.bottom : b.top) - down.clientY
  let y = down.clientY
  let raf = 0
  const look = () => {
    raf = 0
    const h = wrap.querySelector<HTMLElement>('.fc-timegrid-event.fc-event-mirror')?.parentElement
    if (!h) return
    const r = h.getBoundingClientRect()
    if (edge === 'end') {
      const snapped = r.bottom + (parseFloat(h.style.marginBottom) || 0)
      const want = Math.max(y + grab, r.top + 8)
      h.style.marginBottom = `${snapped - want}px`
      onFree({ top: r.top, bottom: want })
    } else {
      const snapped = r.top - (parseFloat(h.style.marginTop) || 0)
      const want = Math.min(y + grab, r.bottom - 8)
      h.style.marginTop = `${want - snapped}px`
      onFree({ top: want, bottom: r.bottom })
    }
  }
  const move = (e: MouseEvent) => {
    y = e.clientY
    if (!raf) raf = requestAnimationFrame(look)
  }
  window.addEventListener('mousemove', move)
  return () => {
    window.removeEventListener('mousemove', move)
    cancelAnimationFrame(raf)
  }
}

/** CAL3 + D4: a resize let go — the block, drawn at its new length (out of sight till then), eases from where the
 * pointer left its edge onto the quarter (160 ms) and wears the just-landed ring. */
function commitStretch(root: ParentNode, id: string, edge: 'start' | 'end', free: { top: number; bottom: number } | null, motion: boolean): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const els = root.querySelectorAll<HTMLElement>(blockSel(id))
      els.forEach((el) => el.removeAttribute('data-landing'))
      const el = els[0]
      if (!el) return
      const r = el.getBoundingClientRect()
      const d = !free || !motion ? 0 : edge === 'end' ? free.bottom - r.bottom : r.top - free.top
      if (Math.abs(d) >= 1) el.animate(edge === 'end' ? [{ bottom: `${-d}px` }, { bottom: '0px' }] : [{ top: `${-d}px` }, { top: '0px' }], { duration: 160, easing: EASE_OUT })
      window.setTimeout(() => ring(el), Math.abs(d) >= 1 ? 160 : 0)
    }),
  )
}

/** CAL4: a block's box (check B, repeat B, a slot's row). dragGuard'd as before; a tick made here plays once when the
 * done state paints — boxFill 90 + checkPop 180, repeat B's arrows turning half round first (CalendarGrid.css) — and
 * never on a box that arrives ticked. */
const tickBox = (taskId: string, done: boolean, toggle: () => void) => (el: HTMLElement | null) => {
  dragGuard(() => {
    if (!done) markTicked(taskId)
    toggle()
  })(el)
  if (el && done && takeTicked(taskId)) playOnce(el, 'tick', 700)
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
    slotMinTime = '00:00:00',
    slotMaxTime = '24:00:00',
    expandRows = false,
    secondZone,
    selectedId = null,
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
    // cal-wave item 8 (Kai's 840px window: the columns stopped short, a blank strip to their right):
    // FullCalendar sizes its tables to its box only on a WINDOW resize, so the rail folding, the
    // splitter or the sidebar left them at the old width. Any change to the box re-measures it, once
    // a frame.
    let raf = 0
    const ro = new ResizeObserver(([entry]) => {
      widthRef.current = Math.round(entry.contentRect.width)
      setNarrowCols(isNarrow(widthRef.current, daysRef.current))
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        fcRef.current?.getApi().updateSize()
        glideRef.current?.restore() // cal-scroll: the columns' width follows the box; the same day stays at the left
      })
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  useEffect(() => setNarrowCols(isNarrow(widthRef.current, visibleDays)), [visibleDays])
  const narrow = initialView !== 'dayGridMonth' && narrowCols
  // Calendar 3e: the dates on screen (the user's zone), so a multi-day span is cut into the pieces
  // that show. Null until FullCalendar reports its first range.
  const [shownDays, setShownDays] = useState<string[] | null>(null)
  const clockTime = useMemo(() => clockFormatter(zone, hour24), [zone, hour24])
  // The Motion 4c free ghost; held across the drag lifecycle.
  const ghostRef = useRef<Ghost | null>(null)
  const stopHoverRef = useRef<(() => void) | null>(null)
  // D4: the placeholder's step watch while a block is dragged.
  const stopSnapRef = useRef<(() => void) | null>(null)
  // S2 + M1: a ghost handed from the drag's end to the drop, which settles it once the block has landed.
  const landingRef = useRef<{ stop: () => void; host: HTMLElement | null; timer: number; carried: Carried[] } | null>(null)
  // CAL3 + D4: a resize under way (its free stretch) and the one just let go (its stepped commit).
  const resizeRef = useRef<{ id: string; edge: 'start' | 'end'; free: { top: number; bottom: number } | null; timer: number; stop: () => void } | null>(null)
  // cal-blocks item 10: the other picked blocks' ghosts while one of them is dragged.
  const carriedRef = useRef<Carried[]>([])
  // Ctrl+drag (menu B): the press began with Ctrl held; `stopKeys` ends the live key watch (the wrapper's
  // kf-cal-copying keeps the original drawn and the cursor a copy while the key is down).
  const copyRef = useRef<{ start: boolean; stopKeys: (() => void) | null }>({ start: false, stopKeys: null })
  useEffect(() => () => {
    ghostRef.current?.stop() // never strand a ghost (or a lit rail section) on unmount
    stopHoverRef.current?.()
    stopSnapRef.current?.()
    resizeRef.current?.stop()
    landingRef.current?.stop()
    landingRef.current?.carried.forEach((c) => c.stop())
    carriedRef.current.forEach((c) => c.stop())
    copyRef.current.stopKeys?.()
  }, [])
  // Ctrl+drag (menu B): FullCalendar starts no drag with Ctrl held (its isPrimaryMouseButton), so a Ctrl-press on a
  // block is handed on without the key — the drag starts, and the drop reads the key to copy instead of move. A
  // press on the block's own controls (its check, ▶ ⋯, a held row, a resize edge) is theirs; a Ctrl-click with no
  // move still reaches eventClick (the multi-selection): only the press is re-sent.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onDown = (e: MouseEvent) => {
      if (!e.isTrusted || e.button !== 0 || !e.ctrlKey) return
      const t = e.target as HTMLElement | null
      const block = t?.closest<HTMLElement>('.fc-timegrid-event')
      if (!t || !block || block.matches('.fc-event-mirror, .kf-synced') || t.closest('[role="button"], [role="checkbox"], .kf-ev-slot-row, .fc-event-resizer')) return
      e.stopImmediatePropagation()
      copyRef.current.start = true
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: 0, buttons: 1, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey }))
    }
    const onUp = () => { copyRef.current.start = false }
    wrap.addEventListener('mousedown', onDown, true)
    window.addEventListener('mouseup', onUp)
    return () => {
      wrap.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mouseup', onUp)
    }
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

  // RM2 (lib/motion): the calendar's DECORATIVE gate (CalendarPage's .cal-motion-on: Effects on, no reduced motion);
  // functional motion (a settle, a fold, a stretch's commit) asks only reducedMotionNow().
  const motionNow = () => !!wrapRef.current?.closest('.cal-motion-on') && !reducedMotionNow()
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
    const drag = new Draggable(el, CARD_DRAG)
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
      el.toggleAttribute('data-selected', id === selectedId) // CAL11: the block whose popover is open
      el.classList.toggle('kf-pending', pending.has(id))
      el.classList.toggle('kf-failed', failed.has(id))
    })
  })

  // M8: blocks that arrive (created, duplicated, restored, dropped from the rail) wear the just-landed
  // ring; blocks that leave fade out where they were. Only while the same days are on screen — paging
  // brings whole weeks in and out, which is no arrival.
  const seen = useRef<{ ids: Set<string>; days: string[] | null } | null>(null)
  // CAL1: the blocks that arrived last, and when — a Ctrl+drag's copy is settled onto the one that arrives after it.
  const arrived = useRef<{ ids: string[]; at: number }>({ ids: [], at: 0 })
  // CAL1: blocks a ghost is landing on or folding away from — they never fade where they were (FullCalendar may draw
  // them anew, unmarked, before they go).
  const quiet = useRef(new Set<string>())
  const hush = useCallback((id: string) => {
    quiet.current.add(id)
    window.setTimeout(() => quiet.current.delete(id), 1000)
  }, [])
  useInsertionEffect(() => {
    // Before FullCalendar redraws: the blocks about to go are still on screen. One a ghost is landing on or folding
    // away from (data-landing) never fades where it was.
    const prev = seen.current
    const wrap = wrapRef.current
    if (!prev || prev.days !== shownDays || !wrap || reducedMotionNow()) return
    const ids = new Set(events.map((e) => e.id))
    for (const id of prev.ids) if (!ids.has(id) && !quiet.current.has(id)) wrap.querySelectorAll<HTMLElement>(`.fc-event[data-kf-id="${CSS.escape(id)}"]:not([data-landing])`).forEach(fadeOut)
  }, [events, shownDays])
  useLayoutEffect(() => {
    const prev = seen.current
    const ids = new Set(events.map((e) => e.id))
    seen.current = { ids, days: shownDays }
    if (!prev || prev.days !== shownDays) return
    const fresh = [...ids].filter((id) => !prev.ids.has(id))
    if (!fresh.length) return
    arrived.current = { ids: fresh, at: Date.now() }
    // CAL10: only the person's own arrivals ring (a create, a copy, a restore) — Google sync, another device's
    // writes and a cold load land quietly. A frame later: FullCalendar draws them after this render.
    const wrap = wrapRef.current
    if (wrap?.closest('.cal-motion-on') && ownArrival()) requestAnimationFrame(() => fresh.forEach((id) => landRing(wrap, id)))
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
      // shot-bugs: a Time block whose tasks outrun it opens out under the pointer, so every row stays reachable.
      if (e.over) classes.push('kf-slot-over')
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
        kfTaskRepeat: e.taskRepeat ?? null,
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
        kfOver: e.over ?? null,
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

  // ── cal-scroll (Kai 2026-10-29): glide through days (./gridGlide) — Day, N days and Week, not the planning strip
  // or Month. FullCalendar draws the days on screen plus `buffer` days either side; the header, the strip of days
  // and CalendarPage's range follow the leftmost day on screen. ──
  const glideOn = initialView !== 'dayGridMonth' && !strip
  const viewDays = initialView === 'timeGridDay' ? 1 : initialView === 'rollingWeek' ? 7 : dayCount
  // A screen's worth either side (three days at least): room for a fling before the buffer re-centres.
  const buffer = glideOn ? Math.max(3, viewDays) : 0
  const glideRef = useRef<Glide | null>(null)
  // A day to put at the left once FullCalendar has drawn a jump (Today far off, a search hit).
  const jumpRef = useRef<string | null>(null)
  // A button held anywhere (a block, a resize, a slot selection, a rail card): never re-centre under it.
  const pressRef = useRef(false)
  const glideCfg = useRef({ viewDays, buffer, hidden: hiddenDays ?? [] })
  glideCfg.current = { viewDays, buffer, hidden: hiddenDays ?? [] }
  /** Day columns on screen from `day`: the view's days less the hidden weekdays. */
  const visibleFrom = (day: string): number => {
    const { viewDays: n, hidden } = glideCfg.current
    let v = 0
    for (let i = 0; i < n; i++) if (!hidden.includes(new Date(`${addDays(day, i)}T12:00:00Z`).getUTCDay())) v++
    return Math.max(1, v)
  }
  /** The leftmost day on screen changed: CalendarPage's header and range follow (a transition — never a glide's frame). */
  const report = (day: string) => {
    const z = latest.current.zone
    setVisibleDays(visibleFrom(day))
    const info = { title: day, start: new Date(zoneDayStart(day, z)), end: new Date(zoneDayStart(addDays(day, glideCfg.current.viewDays), z)) }
    startTransition(() => latest.current.props.onRangeChange?.(info))
  }
  /** Show `day` at the left at once (Today or a search hit beyond the drawn days): the M7 slide, not a glide. */
  const jumpTo = (day: string) => {
    const api = fcRef.current?.getApi()
    if (!api) return
    const g = glideRef.current
    const cur = g?.anchor()
    if (cur && day !== cur) slide(day < cur ? 'prev' : 'next')
    const from = addDays(day, -glideCfg.current.buffer)
    if (zoneDateKey(api.view.activeStart, latest.current.zone) !== from) {
      jumpRef.current = day
      api.gotoDate(from)
      return
    }
    g?.restore(day)
    report(day)
  }
  const initialDate = useMemo(() => (glideOn ? addDays(zoneDateKey(new Date(), zone), -buffer) : undefined), [glideOn, buffer, initialView, dayCount]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const g = glideRef.current
      if (g) return void (g.page(-1) || jumpTo(addDays(g.anchor(), -glideCfg.current.viewDays)))
      slide('prev')
      fcRef.current?.getApi().prev()
    },
    next: () => {
      const g = glideRef.current
      if (g) return void (g.page(1) || jumpTo(addDays(g.anchor(), glideCfg.current.viewDays)))
      slide('next')
      fcRef.current?.getApi().next()
    },
    gotoDate: (date) => {
      const api = fcRef.current?.getApi()
      if (!api) return
      const g = glideRef.current
      if (g) {
        const key = zoneDateKey(date, latest.current.zone)
        const left = g.anchor()
        if (key < left || key >= addDays(left, glideCfg.current.viewDays)) jumpTo(key)
        api.scrollToTime(scrollTimeNear(date, latest.current.props.scrollLeadMinutes ?? SCROLL_LEAD_DESKTOP_MIN))
        return
      }
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
      const g = glideRef.current
      if (g) {
        const key = zoneDateKey(now, latest.current.zone)
        if (!g.glideTo(key)) jumpTo(key)
        api.scrollToTime(scrollTimeNear(now, latest.current.props.scrollLeadMinutes ?? SCROLL_LEAD_DESKTOP_MIN))
        return
      }
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
    // The release of a Ctrl+drag (menu B's copy) is a click on whatever both ends share — not a Ctrl-click on a slot.
    const from = downAt.current
    if (from && Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 3) return
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
      duration: { days: dayCount + 2 * buffer },
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
      duration: { days: 7 + 2 * buffer },
      dateAlignment: 'day',
      dateIncrement: { days: 7 },
    },
    // cal-scroll: one day on screen, its buffer either side (FullCalendar's own Day view draws exactly one).
    ...(buffer ? { timeGridDay: { duration: { days: 1 + 2 * buffer }, dateAlignment: 'day' } } : null),
  }), [dayCount, buffer])
  // Punch 32: 24-hour toggle drives both the block time rows and the gutter labels (lib/clock).
  // One range style (lib/clock clockRange): "10:00–10:30 AM", not FullCalendar's "10:00 AM - 10:30 AM".
  // FC hands the zoned wall clock (zonePlugin), so the hour and minute are the person's.
  const eventTimeFormat = useMemo(() => {
    const hm = (z: { hour: number; minute: number }) => `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`
    return (a: { start: { hour: number; minute: number }; end?: { hour: number; minute: number } }) => (a.end ? clockRange(hm(a.start), hm(a.end), hour24) : clockText(hm(a.start), hour24))
  }, [hour24])
  const slotLabelFormat = useMemo(() => (hour24 ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : { hour: 'numeric', hour12: true } as const), [hour24])
  // cal-wave: the second clock beside each hour label — that hour on today's date in the user's zone, read
  // on the other zone's clock (so a half-hour zone reads "1:30 PM"). FC hands the slot's time of day.
  const slotLabelContent = useMemo(() => {
    if (!secondZone) return undefined
    return (arg: { time?: { milliseconds: number }; text: string }) => {
      const min = Math.round((arg.time?.milliseconds ?? 0) / 60_000)
      const hm = `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
      const other = zoneTimeKey(new Date(zoneToIso(zoneDateKey(new Date(), zone), hm, zone)), secondZone)
      return (
        <>
          <span className="kf-cal-z2">{clockText(other, hour24)}</span>
          <span>{arg.text}</span>
        </>
      )
    }
  }, [secondZone, zone, hour24])
  const zoneVars = useMemo(() => (secondZone ? { ['--kf-z2' as string]: `"${zoneShort(secondZone)}"`, ['--kf-z1' as string]: `"${zoneShort(zone)}"` } : null), [secondZone, zone])
  const headerToolbar = useMemo(() => (hideToolbar ? false : { left: 'prev,next today', center: 'title', right: `timeGridDay,${customView},timeGridWeek,dayGridMonth` }), [hideToolbar])
  // J-15: land two hours above the now-line instead of a fixed 08:00. FC reads scrollTime once per
  // mount (each view switch remounts via `key`); prev/next keep the hour you're looking at, and Today
  // re-scrolls explicitly (the handle above).
  const [scrollTime] = useState(() => scrollTimeNear(new Date(), scrollLeadMinutes))

  const cb = useMemo(() => {
    const L = () => latest.current
    return {
      datesSet: (arg: DatesSetArg) => {
        if (!glideCfg.current.buffer) L().props.onRangeChange?.({ title: arg.view.title, start: arg.view.currentStart, end: arg.view.currentEnd })
        const days = dayRange(zoneDateKey(arg.view.activeStart, L().zone), zoneDateKey(new Date(arg.view.activeEnd.getTime() - 1), L().zone))
        setShownDays((cur) => (cur && cur.join() === days.join() ? cur : days))
        // cal-scroll: the days drawn changed (a re-centre, a jump) — the same day goes back to the left in this task,
        // before anything paints; the header and range are the glide's (report), not the drawn range.
        if (glideCfg.current.buffer) {
          const jump = jumpRef.current
          jumpRef.current = null
          glideRef.current?.restore(jump ?? undefined)
          if (jump) report(jump)
          return
        }
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

        // "Now" as drawn: the pointer over a block shows its actions at the end of the title's line — ▶ Focus on
        // a task, ⋯ its menu (the right-click one). dragGuard: a press here never starts a drag. Touch reaches
        // both through the block's popover and its long-press menu. Hidden on a block too narrow for them (CSS).
        const acts = !arg.isMirror && (
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
        )

        return (
          <div className={`kf-ev-row${done ? ' kf-done' : ''}`} data-tour={arg.isMirror ? undefined : 'calendar-block'}>
            {badge === '⚠' && <span className="kf-ev-badge" title="Overlaps another block">⚠</span>}
            {badge === 'repeat' && <span className="kf-ev-badge kf-ev-repeat" title="Repeats"><Icon name="repeat" size={10} label="Repeats" /></span>}
            {/* Selected B (Kai 2026-10-23): a picked block's check badge — shown by [data-picked], set off FullCalendar's data. */}
            {!arg.isMirror && <span className="kf-ev-pick" aria-hidden="true">✓</span>}
            {cutFrom && <span className="fc-event-time kf-ev-cut kf-ev-cut-from">{cutFrom}</span>}
            {cutInto && <span className="fc-event-time kf-ev-cut kf-ev-cut-into">{cutInto}</span>}
            {/* Check B (cal-blocks): a 2px edge, 1px bigger, softer corners; a repeating task's is repeat B, the
                chasing box — ticking it completes this occurrence, as any task's does. */}
            {p.kfTaskId && !arg.isMirror && (
              <span
                className={`kf-ev-check${done ? ' kf-on' : ''}${p.kfTaskRepeat ? ' kf-rep' : ''}`}
                role="checkbox"
                aria-checked={done}
                aria-label={p.kfTaskRepeat ? repeatCheckName(done, p.kfTaskRepeat) : `${done ? 'Reopen' : 'Complete'} ${arg.event.title}`}
                ref={tickBox(p.kfTaskId, done, () => L().props.onCompleteTask?.(p.kfTaskId!, done))}
              >
                {p.kfTaskRepeat ? <RepeatGlyph done={done} /> : done ? <Tick /> : null}
              </span>
            )}
            <div className="kf-ev-text">
              <div className="kf-ev-head">
                {more && !pinnedMore ? (
                  <div className="fc-event-title" title={title}>{moreLink}</div>
                ) : (
                  <div className="fc-event-title" style={{ WebkitLineClamp: lines }}>
                    {p.kfGoal && <span className="kf-ev-star" aria-label="Goal of the day: ">✶ </span>}
                    <EmojiText text={title} />
                  </div>
                )}
                {acts}
              </div>
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
                  <div className="fc-event-time kf-ev-fill">
                    {p.kfFill}
                    {p.kfOver && <> · <span className="kf-ev-over">{p.kfOver}</span></>}
                  </div>
                  {p.kfHeld.map((h) => (
                    <div key={h.id} ref={heldRow} className={`kf-ev-slot-row${h.done ? ' kf-done' : ''}`} data-slot-task={h.id} data-task-id={h.id} data-title={h.title} data-duration={h.minutes} data-length={durationLabel(h.minutes)}>
                      <span
                        className={`kf-ev-check${h.done ? ' kf-on' : ''}`}
                        role="checkbox"
                        aria-checked={h.done}
                        aria-label={`${h.done ? 'Reopen' : 'Complete'} ${h.title}`}
                        ref={tickBox(h.id, h.done, () => L().props.onCompleteTask?.(h.id, h.done))}
                      >
                        {h.done ? <Tick /> : null}
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
        info.el.toggleAttribute('data-selected', id === L().props.selectedId)
        paintColor(info.el, (info.event.extendedProps as { kfColor?: string | null })?.kfColor)
        // CAL8: a recolour eases (CalendarGrid.css) — from the next frame, so a block never fades in from the kind's hue.
        requestAnimationFrame(() => info.el.setAttribute('data-kf-hue', ''))
        // Punch 34: double-click goes straight to the task editor (single click still opens
        // the details popover — the navigation unmounts it, so the two don't fight).
        info.el.addEventListener('dblclick', () => L().props.onEventDoubleClick?.(id))
        // cal-clicks: a right-click opens menu B; from the keyboard (Shift+F10, the menu key — Enter opens the details,
        // FullCalendar's own key handler) it hangs at the block's corner, not at 0,0.
        const menuAt = (x: number, y: number) => {
          const r = info.el.getBoundingClientRect()
          L().props.onEventContextMenu?.(id, x || y ? x : r.left + 8, x || y ? y : r.bottom)
        }
        info.el.addEventListener('contextmenu', (e: MouseEvent) => {
          if (!L().props.onEventContextMenu) return
          e.preventDefault()
          menuAt(e.clientX, e.clientY)
        })
        info.el.addEventListener('keydown', (e: KeyboardEvent) => {
          if (!L().props.onEventContextMenu || !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return
          e.preventDefault()
          menuAt(0, 0)
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
      // is FC's own mirror. eventDragStop fires before eventDrop, in the same task.
      eventDragStart: (info: EventDragStartArg) => {
        // Whoever drags a block knows it: the one-time "Drag a block to move it" hint never shows after
        // (it used to land 1.5 s after the first drag, over the block the next one reached for).
        markSeen('hint:calendar')
        landingRef.current?.stop()
        landingRef.current?.carried.forEach((c) => c.stop())
        const je = info.jsEvent as MouseEvent | null
        const from = je instanceof MouseEvent ? downAt.current : null // a touch drag has no mouse press to measure from
        const wrap = wrapRef.current
        const motion = motionNow() // the lean, its trail and the snap flash are decorative: Effects on only
        ghostRef.current = startGhost(info.el, je, GHOST_ID, from, motion)
        stopHoverRef.current = trackRailHover(L().props.railRef?.current)
        if (motion && wrap) stopSnapRef.current = watchSnaps(wrap)
        // Ctrl+drag (menu B): with the key down (from the press, or pressed meanwhile) the original stays drawn.
        const copying = (on: boolean) => wrap?.classList.toggle('kf-cal-copying', on)
        copying(copyRef.current.start || !!je?.ctrlKey || !!je?.metaKey)
        const key = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') copying(e.type === 'keydown') }
        window.addEventListener('keydown', key)
        window.addEventListener('keyup', key)
        copyRef.current.stopKeys = () => {
          window.removeEventListener('keydown', key)
          window.removeEventListener('keyup', key)
          copying(false)
          copyRef.current.stopKeys = null
        }
        // cal-blocks item 10 (Kai: "I don't see the events moving together"): dragging one of several picked blocks
        // carries every other picked block on screen as its own ghost under the pointer, its offset kept (the 2c
        // wobble too); each one's block stays, faded, where it was until they all land together (eventDrop).
        const id = blockIdOf(info.event)
        const picked = L().pickedIds
        if (copyRef.current.start || picked.length < 2 || !picked.includes(id) || info.event.allDay) return
        carriedRef.current = picked.flatMap((pid): Carried[] => {
          if (pid === id) return []
          const el = wrapRef.current?.querySelector<HTMLElement>(`.fc-timegrid-event[data-kf-id="${CSS.escape(pid)}"]:not(.fc-event-mirror):not(.kf-synced)`)
          if (!el) return []
          const g = startGhost(el, je, null, from)
          el.setAttribute('data-carried', '')
          return [{ id: pid, host: g.host, stop: () => { el.removeAttribute('data-carried'); g.stop() } }]
        })
      },
      eventDragStop: (info: EventDragStopArg) => {
        const ghost = ghostRef.current
        ghostRef.current = null
        ghost?.release() // the ghost stops following the pointer (and leaning); it's let go of below
        stopHoverRef.current?.()
        stopHoverRef.current = null
        stopSnapRef.current?.()
        stopSnapRef.current = null
        copyRef.current.stopKeys?.()
        const carried = carriedRef.current
        carriedRef.current = []
        const je = info.jsEvent as MouseEvent | null
        const wrap = wrapRef.current
        const motion = !reducedMotionNow() // RM2: a settle, a ride home, a fold are functional — they play with Effects off
        const contains = (el: Element | null | undefined) => {
          if (!el || !je) return false
          const r = el.getBoundingClientRect()
          return je.clientX >= r.left && je.clientX <= r.right && je.clientY >= r.top && je.clientY <= r.bottom
        }
        // The pointer left the grid, so FC reverts (instantly, dragRevertDuration 0).
        // Rail = the section under the pointer decides (punch 33, Kai 2026-10-12); anywhere else
        // = §7 invalid drop → the soft-no: the ghost shakes ±4px decaying ~320ms, then rides home (CAL2).
        if (je && wrap && !contains(wrap)) {
          const rail = L().props.railRef?.current
          const section = rail && contains(rail) ? (railSectionAt(rail, je.clientX, je.clientY)?.dataset.section ?? null) : undefined
          if (section !== undefined) hush(info.event.id) // its write may redraw the grid before this returns
          const handled = section !== undefined && (L().props.onDragToRail?.(info.event.id, section) ?? false)
          carried.forEach((c) => c.stop())
          if (!ghost) return
          if (handled && rail) return foldIntoRail(wrap, ghost, info.event.id, rail, (info.event.extendedProps as Partial<BlockProps>).kfTaskId ?? null, motion)
          if (!handled && ghost.host) return refuse(wrap, [{ ...ghost, id: info.event.id }], motion)
          return ghost.stop()
        }
        // S2 + M1: over the grid the ghost stays up for the drop to settle it where the block lands. CAL1: an unchanged
        // drop fires no eventDrop — the timer (the end of this same task) glides it home at once.
        if (!ghost) return carried.forEach((c) => c.stop())
        const landing = { stop: ghost.stop, host: ghost.host, timer: 0, carried }
        landing.timer = window.setTimeout(() => {
          if (landingRef.current !== landing) return
          landingRef.current = null
          if (!wrap) return landing.stop()
          settleGhost(wrap, landing, info.event.id, motion, { ring: false })
          for (const c of carried) settleGhost(wrap, c, c.id, motion, { ring: false })
        })
        landingRef.current = landing
      },
      eventDrop: (info: EventDropArg) => {
        const landing = landingRef.current
        landingRef.current = null
        if (landing) window.clearTimeout(landing.timer)
        const id = info.event.id
        const carried = landing?.carried ?? []
        const motion = !reducedMotionNow()
        const wrap = wrapRef.current
        const je = info.jsEvent as MouseEvent | null
        // Ctrl+drag (menu B): the original goes back where it was and a copy lands here, with one Undo — CAL1: the
        // ghost settles onto the copy (the first block to arrive after the drop).
        if ((je?.ctrlKey || je?.metaKey) && info.event.start && L().props.onDuplicateAt) {
          const allDay = info.event.allDay
          const end = info.event.end ?? new Date(info.event.start.getTime() + (allDay ? 86_400_000 : 3_600_000))
          const start = info.event.start.toISOString()
          info.revert()
          carried.forEach((c) => c.stop())
          const t0 = Date.now()
          if (L().props.onDuplicateAt?.(id, start, end.toISOString(), allDay)) {
            const copy = () => (wrap && arrived.current.at >= t0 && arrived.current.ids[0] ? wrap.querySelector<HTMLElement>(blockSel(arrived.current.ids[0])) : null)
            if (landing && wrap) settleGhost(wrap, landing, copy, motion)
            else landing?.stop()
            return
          }
          if (landing?.host && wrap) refuse(wrap, [{ ...landing, id }], motion)
          else landing?.stop()
          return
        }
        // Multi-select: a picked block dragged carries the other picked blocks by the same amount — all of them land
        // together (cal-blocks item 10), or, if any would leave the days on screen, none moves (the soft-no).
        const picked = L().pickedIds
        let handled = false
        if (picked.length > 1 && picked.includes(id) && info.event.start && info.oldEvent.start && !info.event.allDay && !info.oldEvent.allDay) {
          const delta = info.event.start.getTime() - info.oldEvent.start.getTime()
          const view = fcRef.current?.getApi().view
          // cal-scroll: the days on screen are the glide's (FullCalendar draws a buffer either side), not its range.
          const left = glideRef.current?.anchor()
          const [from, to] = left ? [zoneDayStart(left, L().zone), zoneDayStart(addDays(left, glideCfg.current.viewDays), L().zone)] : [view?.activeStart.getTime() ?? 0, view?.activeEnd.getTime() ?? 0]
          const out = !!view && L().props.events.some((e) => picked.includes(e.id) && (Date.parse(e.start) + delta < from || Date.parse(e.end) + delta > to))
          if (out) {
            info.revert()
            if (landing?.host && wrap) refuse(wrap, [{ ...landing, id }, ...carried], motion)
            else {
              landing?.stop()
              carried.forEach((c) => c.stop())
            }
            return
          }
          handled = !!L().props.onMoveMany?.(picked, delta)
          if (handled && wrap) for (const c of carried) settleGhost(wrap, c, c.id, motion)
        }
        if (!handled) carried.forEach((c) => c.stop())
        // CAL1: a task's block dropped on a Time block goes INTO it (CalendarPage, ./slots slotAt) — its block comes off
        // and a row lands in the slot: the ghost settles onto that row.
        let slotTask: string | null = null
        if (!handled && info.event.start) {
          // Crossing the all-day boundary nulls the end (FC convention) — restate a real one:
          // a converted all-day block spans its day; a re-timed chip gets the default hour.
          const allDay = info.event.allDay
          const end = info.event.end ?? new Date(info.event.start.getTime() + (allDay ? 86_400_000 : 3_600_000))
          const t = info.event.start.getTime()
          const taskId = (info.event.extendedProps as Partial<BlockProps>).kfTaskId
          if (taskId && !allDay && L().props.events.some((e) => e.type === 'time_block' && !e.allDay && e.id !== id && Date.parse(e.start) <= t && t < Date.parse(e.end))) slotTask = taskId
          if (landing) hush(id)
          L().props.onMove(id, info.event.start.toISOString(), end.toISOString(), allDay, info.revert)
        }
        setPinnedId(id) // Polish F2b: where it landed stays in view
        if (!landing) return
        if (!wrap) return landing.stop()
        const row = slotTask
        if (row) settleGhost(wrap, landing, () => wrap.querySelector<HTMLElement>(`.kf-ev-slot-row[data-slot-task="${CSS.escape(row)}"]`), motion, { hide: id })
        else settleGhost(wrap, landing, id, motion)
      },
      // While resizing, FC keeps the original chip visible under the mirror — with both drawn the overlap reads as a
      // dark doubled rectangle: the original is hidden for the duration. CAL3: the mirror is drawn as the solid block
      // (.kf-cal-resizing); D4 (Kai's yes): it stretches freely under the pointer and commits to the quarter on release.
      eventResizeStart: (info: EventResizeStartArg) => {
        info.el.style.visibility = 'hidden'
        const wrap = wrapRef.current
        wrap?.classList.add('kf-cal-resizing')
        const je = info.jsEvent as MouseEvent | null
        const edge: 'start' | 'end' = (je?.target as Element | null)?.closest('.fc-event-resizer-start') ? 'start' : 'end'
        resizeRef.current?.stop()
        const rs: NonNullable<typeof resizeRef.current> = { id: blockIdOf(info.event), edge, free: null, timer: 0, stop: () => {} }
        resizeRef.current = rs
        if (!wrap || !je || reducedMotionNow() || !info.el.matches('.fc-timegrid-event')) return
        rs.stop = stretchFreely(wrap, info.el, edge, je, (free) => {
          rs.free = free
        })
      },
      eventResizeStop: (info: EventResizeStopArg) => {
        const wrap = wrapRef.current
        wrap?.classList.remove('kf-cal-resizing')
        const rs = resizeRef.current
        rs?.stop()
        info.el.style.visibility = ''
        if (!rs || !wrap) return
        // The block stays out of sight until it has painted at its new length (no frame of the old one), then (eventResize)
        // eases from where the pointer let go onto its quarter. Nothing changed (or refused): it shows again at once.
        wrap.querySelectorAll<HTMLElement>(blockSel(rs.id)).forEach((el) => el.setAttribute('data-landing', ''))
        rs.timer = window.setTimeout(() => {
          if (resizeRef.current === rs) resizeRef.current = null
          wrap.querySelectorAll<HTMLElement>(blockSel(rs.id)).forEach((el) => el.removeAttribute('data-landing'))
        })
      },
      eventResize: (info: EventResizeDoneArg) => {
        const rs = resizeRef.current
        resizeRef.current = null
        if (rs) window.clearTimeout(rs.timer)
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
          L().props.onResize(info.event.id, new Date(startMs).toISOString(), new Date(endMs).toISOString(), info.revert)
        }
        if (rs && wrapRef.current) commitStretch(wrapRef.current, rs.id, rs.edge, rs.free, !reducedMotionNow())
      },
      drop: (info: DropArg) => {
        const { taskId, inboxId } = info.draggedEl.dataset
        if (!(taskId || inboxId) || !info.date) return
        L().props.onExternalDrop({ taskId, inboxId }, info.date.toISOString(), info.allDay)
      },
    }
  }, [heldRow, hush])

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
  // CAL5: a view switch remounts FullCalendar (the key) — the new view cross-fades in (160 ms), not a cut.
  const fcKey = `${initialView}-${dayCount}-${density}-${secondZone ? 'z2' : ''}${glideOn ? '-glide' : ''}`
  const shownKey = useRef(fcKey)
  useLayoutEffect(() => {
    if (shownKey.current === fcKey) return
    shownKey.current = fcKey
    if (!reducedMotionNow()) playOnce(wrapRef.current, 'view', 220)
  }, [fcKey])
  // cal-scroll: the glide lives with this FullCalendar (a view switch remounts both); today sits at the left.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!glideOn || !wrap) return
    const start = zoneDateKey(new Date(), latest.current.zone)
    // FullCalendar's root undoes the interface zoom (CalendarGrid.css `zoom: calc(1 / var(--kf-ui-scale))`), and
    // Chrome can leave a freshly mounted root at zoom 1 until its style is next recalculated: recalc it now, so the
    // glide measures the real width (seen with reduced motion, where no view fade restyles it).
    const fcRoot = wrap.querySelector<HTMLElement>('.fc')
    fcRoot?.classList.add('kf-restyle')
    void fcRoot?.offsetWidth
    fcRoot?.classList.remove('kf-restyle')
    const g: Glide = attachGlide(wrap, {
      visible: () => visibleFrom(g.anchor()),
      busy: () => pressRef.current,
      onAnchor: report,
      recenter: (day) => {
        const api = fcRef.current?.getApi()
        const from = addDays(day, -glideCfg.current.buffer)
        if (api && zoneDateKey(api.view.activeStart, latest.current.zone) !== from) api.gotoDate(from)
      },
      onScroll: (x) => latest.current.props.onGlide?.(x),
    }, start)
    glideRef.current = g
    g.restore(start)
    report(start)
    const down = () => { pressRef.current = true }
    // After FullCalendar's own mouseup (a drop) has run: a drag's edge scroll may have left the days between two.
    const up = () => {
      if (!pressRef.current) return
      pressRef.current = false
      window.setTimeout(() => glideRef.current?.release())
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => {
      g.destroy()
      glideRef.current = null
      wrap.style.removeProperty('--kf-glide-w')
      latest.current.props.onGlide?.(0)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
  }, [glideOn, fcKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // cal-scroll: a render can change the grid's geometry (the narrow tier, the second clock, the root zoom landing a
  // style pass late): the glide re-measures when it did.
  useLayoutEffect(() => glideRef.current?.check())
  const wrapStyle = useMemo(
    () => ({ height: '100%', minWidth: gridMinWidth(visibleDays, secondZone ? TIME_AXIS_W + ZONE2_W : undefined), ['--kf-cal-density' as string]: density === 's' ? 0.8 : density === 'l' ? 1.2 : 1, ...zoneVars }) as React.CSSProperties,
    [visibleDays, density, secondZone, zoneVars],
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
      className={[narrow && 'kf-cal-narrow', secondZone && 'kf-cal-2z', expandRows && 'kf-cal-fit', glideOn && 'kf-glide'].filter(Boolean).join(' ') || undefined}
      onContextMenu={handleGridContextMenu}
      onClick={handleCtrlClick}
      onMouseDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY } }}
      style={wrapStyle}
    >
    <FullCalendar
      key={fcKey}
      ref={fcRef}
      plugins={PLUGINS}
      timeZone={zone}
      initialView={initialView}
      initialDate={initialDate}
      firstDay={firstDay}
      hiddenDays={hiddenDays}
      // Punch 35: top-edge resize — start moves, end stays put. FC's own start handle.
      eventResizableFromStart
      // Punch 33/35: an off-grid drop reverts instantly (rail handles deletion, soft-no shakes);
      // the default 500ms glide-back would fight both.
      dragRevertDuration={0}
      eventTimeFormat={eventTimeFormat}
      slotLabelFormat={slotLabelFormat}
      slotLabelContent={slotLabelContent}
      slotMinTime={slotMinTime}
      slotMaxTime={slotMaxTime}
      expandRows={expandRows}
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
