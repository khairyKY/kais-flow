import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { useOpenTask } from '../tasks/openTask'
import { EmojiText } from '../../components/EmojiText'
import { CalendarGrid, type CalendarGridHandle, type CalendarGridView } from './CalendarGrid'
import { useCalendarEvents, useCalendarRows, moveOrResizeEvent, resizeEvent, scheduleTaskWithUndo, deleteEventWithUndo, deleteEventsWithUndo, moveEventsByWithUndo, putInSlotWithUndo, outOfSlotWithUndo } from './api'
import { inSlot, slotAt, slotFill, slotTasks } from './slots'
import { TaskMenu } from '../tasks/TaskMenu'
import { taskActions } from '../tasks/useRowGrammar'
import { placeName } from '../tasks/move'
// Polish F2b (conductor decision 2026-09-26, punch 6): every calendar completion — the block's
// checkbox, its right-click Complete, the rail card's checkbox — toasts "Done" with Undo, the same
// completeTaskWithUndo the Tasks and Today lists use (a repeat's spawned next copy is taken back too).
import { useTasks, completeTaskWithUndo, uncompleteTask, rescheduleDue, moveToTomorrowWithUndo } from '../tasks/api'
import { useRowGrammar } from '../tasks/useRowGrammar'
import { RowMenuButton } from '../tasks/SwipeRow'
import { aiFiling, eventToRail, fileToCalendar, fileToTask, inboxMinutes, inboxTitle, usePendingInboxItems } from '../inbox/api'
import { railDropAction, scopeTarget, SMART_LISTS, type RailSection } from './railDrop'
import { dayWord } from '../inbox/inboxDisplay'
import { dayTray, nextFreeSlot, railBuckets, railMinutes, scheduledToday, type RailTask } from './replan'
import { todayFor } from '../tasks/planMath'
import { DatePicker } from '../../components/DatePicker'
import { dayHint } from '../../components/pickerMath'
import { cairoDateKey, scheduleToday, scheduleTomorrow, tomorrowHint } from '../../lib/dateShortcuts'
import { appZone, isZone } from '../../lib/appZone'
import { clockOptions, hour24, setHour24, useHour24 } from '../../lib/clock'
import { useOutboxMarks } from '../../lib/outbox'
import { filterByScope, type RailScope, type RailScopeKind } from '../tasks/grouping'
import { Button, Checkbox } from '../../components/kit'
import { dragGuard } from './dragGuard'
import { PlanButton } from './PlanButton'
import { useCardOpen } from './cardOpen'
import { resolveTag, formatDuration } from '../tasks/taskDisplay'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useAppSettings, updateAppSetting, useCalendarDefaultView } from '../../lib/settings'
import { daisyAsset } from '../../lib/gardenAssets'
import { useMotionEnabled, useOverlayExit } from '../../lib/motion'
import { toastUndo } from '../../lib/undo'
import { slotFields, timeRange, timeText, zoneHour, zoneTimeKey } from './eventTime'
import { PlanningPanel } from './PlanningPanel'
import { blockedOn, freeGaps, freeLeft, minutesLabel } from './planningMode'
import { cardDraggable } from './cardDrag'
import { conflictsOf } from './overlapLayout'
import { parseWeekend } from '../../lib/weekend'
import { addDays, durationLabel } from '../../components/pickerMath'
import { BlockMenu } from './BlockMenu'
import { BLOCK_MENU_WIDTH, besideBlock, isSynced } from './blockMenuSpec'
import { useLinkedEvent } from './linkedEvent'
import { findBlock } from './series'
import { uiZoom } from '../../lib/uiScale'
import { QuickCreate, type QuickCreateKind } from './QuickCreate'
import { ViewOptionsPopover, readViewOptions, writeViewOptions, type CalViewOptions, type ViewCell } from './ViewOptionsPopover'
import { fitDays, fitHours, gridMinWidth, MIN_COL_W, RAIL_SPLIT_W, RAIL_TAB_W, railYields, RESPONSIVE_COL_W, TIME_AXIS_W, visibleDayCount, ZONE2_W } from './weekFit'
import { NowCard } from './NowCard'
import { useDayRollover } from './useDayRollover'
import { useMinuteNow } from '../today/useMinuteNow'
import { goalIdOf } from '../today/top3Order'
import { legacyGoalId } from '../today/goalStore'
import { cachedStarEvents } from '../today/api'
import { useStartFocus } from '../today/startFocus'
import { useMinuteClock } from '../../lib/minuteClock'
import { daisyColumnStage } from '../../lib/growthStages'
import { useIsMobile } from '../../components/BottomSheet'
import { PhoneCalendar } from './PhoneCalendar'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/States'
import type { ContextMenuItem } from '../../components/ContextMenu'
import { isTypingTarget } from '../../components/useListKeys'
import { overlayCount } from '../../lib/overlayStack'
import type { Area, CalendarEvent, Domain, InboxItem, Project, Task } from '../../lib/types'

const RAIL_W_KEY = 'kf.calRailWidth'
const PLANNING_KEY = 'kf.calPlanning'
// Polish D: '1' = the user folded the Unscheduled rail, '0' = they opened it; unset = automatic
// (folded only when the visible days wouldn't keep their minimum width beside it — weekFit.ts).
const RAIL_FOLD_KEY = 'kf.calRailFolded'
const DEFAULT_RAIL_W = 244
/** cal-wave item 8: the grid's least width beside the rail — the one-line header and a day column. */
const GRID_MIN_W = 320
const RAIL_MIN = 150
const RAIL_MAX = 760

// ── Calendar.dc.html 1a (desktop: task rail + time-grid). Phones: PhoneCalendar (Calendar Phone.dc.html). ──

type ViewKind = 'day' | 'ndays' | 'week' | 'month'
const VIEW_MAP: Record<ViewKind, CalendarGridView> = { day: 'timeGridDay', ndays: 'customDayCount', week: 'rollingWeek', month: 'dayGridMonth' }

const SCOPE_KIND_OPTIONS: { value: RailScopeKind; label: string }[] = [
  { value: 'smart', label: 'Smart list' },
  { value: 'project', label: 'Project' },
  { value: 'area', label: 'Area' },
  { value: 'domain', label: 'Domain' },
]


// The grid's range is on the user's zone (CalendarGrid `timeZone`): FullCalendar hands its days'
// midnights as instants, so they are read as that zone's dates, then drawn as dates in no zone.
const noon = (key: string) => new Date(`${key}T12:00:00Z`)

function weekNumber(d: Date): number {
  const day = noon(cairoDateKey(d))
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  return Math.ceil(((day.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7)
}

/** FullCalendar's range end is exclusive — its last day is the one just before it. */
function rangeLabel(start: Date, end: Date, viewKind: ViewKind, short = false): string {
  const first = noon(cairoDateKey(start))
  const last = noon(cairoDateKey(new Date(end.getTime() - 1)))
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  // cal-wave: a narrow header's form — "Oct", "25", "25–28".
  if (short) return viewKind === 'month' ? fmt(first, { month: 'short' }) : viewKind === 'day' || first.getTime() === last.getTime() ? String(first.getUTCDate()) : `${first.getUTCDate()}–${last.getUTCDate()}`
  if (viewKind === 'month') return fmt(first, { month: 'long', year: 'numeric' })
  if (viewKind === 'day') return fmt(first, { weekday: 'short', month: 'short', day: 'numeric' })
  const endStr = first.getUTCMonth() === last.getUTCMonth() ? String(last.getUTCDate()) : fmt(last, { month: 'short', day: 'numeric' })
  return `${fmt(first, { month: 'short', day: 'numeric' })} — ${endStr}`
}

interface QuickCreateState {
  kind: QuickCreateKind
  slot: { date: string; start: string; end: string; allDay: boolean } | null
  anchor: { x: number; y: number } | null
}

/** The block a click opened in the §5 popover: what it was (an edit can re-anchor a repeat under it —
 * series.findBlock) and where the popover sits. */
interface Selected {
  id: string
  start: string
  at: { x: number; y: number }
}

/** besideBlock() of the block on screen, else (not drawn yet) the middle of the window. */
function anchorOf(id: string): { x: number; y: number } {
  const el = document.querySelector(`.fc-event[data-kf-id="${CSS.escape(id)}"]`)
  if (el) return besideBlock(el.getBoundingClientRect(), window.innerWidth, uiZoom())
  return { x: Math.max(8, (window.innerWidth - BLOCK_MENU_WIDTH * uiZoom()) / 2), y: window.innerHeight / 4 }
}

const DAY_MS = 86_400_000

// ── Calendar smoothness S1 (2026-10-22 audit): the grid is memoised and FullCalendar compares what it's
// handed by identity, so the page hands it stable things. ──

/** An ids array that keeps its identity while its contents don't change. */
function useSameIds(ids: string[]): string[] {
  const key = ids.join()
  return useMemo(() => ids, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Stable wrappers around handlers that close over the latest render (the grid's props). */
function useStableHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T {
  const ref = useRef(handlers)
  useLayoutEffect(() => {
    ref.current = handlers
  })
  return useMemo(
    () => Object.fromEntries(Object.keys(handlers).map((k) => [k, (...args: never[]) => (ref.current[k] as (...a: never[]) => unknown)(...args)])) as T,
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
}

/** M2: what a popover showed, kept while it plays its way out after its state was cleared. */
function useKept<T>(value: T | null, mounted: boolean): T | null {
  const kept = useRef(value)
  if (value) kept.current = value
  return value ?? (mounted ? kept.current : null)
}

/** The rail footer (p7e A15): busy blocks today, and the free time left inside 08:00–20:00 from now —
 * Free events, past time and off-hours aren't free time (the planning strip's own footer rule). S9: the
 * minute is read here, not by the page. */
function RailLoad({ events }: { events: CalendarEvent[] }) {
  const now = useMinuteNow()
  const load = useMemo(() => {
    const day = cairoDateKey(now)
    return { blocked: blockedOn(events, day), free: minutesLabel(freeLeft(events, day, now)) }
  }, [events, now])
  return (
    <div className="cal-rail-load" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title="Blocks on today's calendar · free time left today">
      {load.blocked} {load.blocked === 1 ? 'block' : 'blocks'} · {load.free} free
    </div>
  )
}


// ── The planning rail's sections and cards (Kai 2026-10-07). ──

const RAIL_SECTIONS_KEY = 'kf.calRailSections'
type PlanTarget = { kind: 'task'; r: RailTask } | { kind: 'inbox'; item: InboxItem }

/** Which sections the person folded (per device). Lists starts folded. */
function readSections(): Record<RailSection, boolean> {
  const base = { overdue: false, today: false, scheduled: false, inbox: false, lists: true }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(RAIL_SECTIONS_KEY) ?? '{}') }
  } catch {
    return base
  }
}

// ── Kai 2026-10-14 (Akiflow): under the grid, each day column's tasks with no time yet. A row drags
// up onto the grid like a rail card (its own Draggable). The cells sit on the grid's measured day
// columns, so hidden weekends, a sideways scroll and the grid's scrollbar all line up. Not drawn
// when no shown day has one — no empty band. ──

const TRAY_FOLD_KEY = 'kf.calTrayFolded'
const TRAY_ROW = 34
const TRAY_MAX_ROWS = 4

function DayTray({ wrapRef, rangeKey, minWidth, tasks, events, domains, projects, areas, onPlan }: {
  wrapRef: React.RefObject<HTMLDivElement | null>
  /** Changes when the grid shows other days: re-measure its columns. */
  rangeKey: string
  minWidth?: number
  tasks: Task[]
  events: CalendarEvent[]
  domains: Domain[]
  projects: Project[]
  areas: Area[]
  onPlan: (r: RailTask, x: number, y: number) => void
}) {
  const trayRef = useRef<HTMLElement>(null)
  const now = useMinuteNow() // S9: the tray's own minute, not the page's
  const [cols, setCols] = useState<{ date: string; left: number; width: number }[]>([])
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(TRAY_FOLD_KEY) === '1'
    } catch {
      return false // no storage (a private window): open
    }
  })
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Rects are visual pixels (the root zoom); the tray is laid out in layout pixels.
        const z = uiZoom()
        const base = wrap.getBoundingClientRect().left
        const next = [...wrap.querySelectorAll<HTMLElement>('.fc-timegrid-body .fc-timegrid-col[data-date]')].map((el) => {
          const r = el.getBoundingClientRect()
          return { date: el.dataset.date ?? '', left: (r.left - base) / z + wrap.scrollLeft, width: r.width / z }
        })
        setCols((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    const fc = wrap.querySelector('.fc')
    if (fc) ro.observe(fc)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [wrapRef, rangeKey])
  const dayKeys = cols.map((c) => c.date).join()
  const byDay = useMemo(() => dayTray(tasks, events, dayKeys ? dayKeys.split(',') : [], now), [tasks, events, dayKeys, now])
  const most = Math.max(0, ...[...byDay.values()].map((rows) => rows.length))
  // One Draggable on the tray, as on the rail: it delegates to `.unscheduled-task`.
  useEffect(() => {
    if (!trayRef.current) return
    const draggable = cardDraggable(trayRef.current)
    return () => draggable.destroy()
  }, [most > 0])
  if (most === 0) return null
  const toggle = () => {
    const next = !folded
    setFolded(next)
    try {
      localStorage.setItem(TRAY_FOLD_KEY, next ? '1' : '0')
    } catch {
      /* no storage: this visit only */
    }
  }
  return (
    <section ref={trayRef} className="cal-tray" aria-label="Each day's tasks with no time yet" style={{ height: folded ? 30 : Math.min(most, TRAY_MAX_ROWS) * TRAY_ROW + 10, minWidth }}>
      <button
        type="button"
        className="cal-tray-fold"
        style={{ width: cols[0]?.left ?? 0 }}
        onClick={toggle}
        aria-expanded={!folded}
        aria-label={folded ? "Show each day's tasks" : "Hide each day's tasks"}
        title={folded ? "Show each day's tasks" : "Hide each day's tasks"}
      >
        <Icon name="chevdown" size={14} style={{ transform: folded ? 'rotate(-90deg)' : undefined, transition: 'transform var(--dur-quick)' }} />
      </button>
      {cols.map((c) => {
        const rows = byDay.get(c.date) ?? []
        return (
          <div key={c.date} className="cal-tray-day" data-date={c.date} style={{ left: c.left, width: c.width }}>
            {folded
              ? rows.length > 0 && <span className="cal-tray-count">{rows.length} {rows.length === 1 ? 'task' : 'tasks'}</span>
              : rows.map((r) => <RailTaskCard key={r.task.id} r={r} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => onPlan(r, x, y)} />)}
          </div>
        )
      })}
    </section>
  )
}

function RailSectionBox({ name, label, count, terra, folded, onToggle, empty, keep, children }: {
  name: RailSection
  label: string
  count: number
  terra?: boolean
  folded: boolean
  onToggle: (name: RailSection) => void
  empty: string
  /** Shown with nothing in it (Lists on a scope the person picked). */
  keep?: boolean
  children: React.ReactNode
}) {
  // cal-wave item 18 (Kai 2026-10-25): an empty section steps aside — back only while a block is dragged
  // (it is still a drop target: the CSS shows it while the drag ghost is up).
  return (
    <section className="cal-rail-sec" data-section={name} data-empty={count === 0 && !keep ? '' : undefined}>
      <button type="button" className="cal-rail-sec-head" aria-expanded={!folded} onClick={() => onToggle(name)}>
        <Icon name="chevdown" size={14} style={{ transform: folded ? 'rotate(-90deg)' : undefined, transition: 'transform var(--dur-quick)' }} />
        <span style={{ color: terra && count > 0 ? 'var(--acc-terra)' : undefined }}>{label}</span>
        <span className="cal-rail-sec-count">{count}</span>
      </button>
      {!folded && (
        <div className="cal-rail-cards">
          {children}
          {count === 0 && <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>{empty}</p>}
        </div>
      )}
    </section>
  )
}

function RailTaskCard({ r, domains, projects, areas, onPlan, onJump }: {
  r: RailTask
  domains: Domain[]
  projects: Project[]
  areas: Area[]
  onPlan: (x: number, y: number) => void
  /** cal-wave Scheduled: the card shows its block's time and a click goes to the block. */
  onJump?: () => void
}) {
  const { task: t, block } = r
  // Right-click: the one task menu (Pick date… / Tomorrow route through rescheduleDue, so a missed
  // block moves or comes off with the replan); a missed block can also just be unscheduled.
  const grammar = useRowGrammar(t, { projects, domains, canUnschedule: !!block, actions: block ? { unschedule: () => deleteEventWithUndo(block, 'Unscheduled') } : undefined })
  const tag = resolveTag(t, domains, projects, areas)
  const missed = block ? new Date(block.starts_at) : null
  const cardOpen = useCardOpen(t.id)
  const open = onJump
    ? {
        ...cardOpen,
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          if (e.currentTarget.contains(e.target as Node)) onJump()
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          if (e.key !== 'Enter' || e.target !== e.currentTarget) return
          e.preventDefault()
          onJump()
        },
      }
    : cardOpen
  return (
    <div
      className="unscheduled-task"
      {...open}
      data-task-id={t.id}
      data-title={t.title}
      data-duration={railMinutes(r)}
      data-length={durationLabel(railMinutes(r))}
      onContextMenu={grammar.onContextMenu}
      title={tag ? `${t.title} · ${tag.label}` : t.title}
    >
      {/* R4 (Kai 2026-07-20): tick a task off without scheduling it first. The guard swallows
          pointerdown so FullCalendar's Draggable never sees it. */}
      <span ref={dragGuard(() => completeTaskWithUndo(t))} style={{ display: 'inline-flex', flex: 'none' }}>
        <Checkbox checked={false} size={15} />
      </span>
      <span className="cal-row-title"><EmojiText text={t.title} /></span>
      <span className="cal-row-meta">
        {onJump && block && !block.all_day ? (
          <span className="cal-row-at">{timeRange(new Date(block.starts_at), new Date(block.ends_at))}</span>
        ) : r.late > 0 ? (
          <span style={{ color: 'var(--acc-terra-ink)' }} title={missed ? `Missed block: ${missed.toLocaleString('en-US', { weekday: 'short', ...clockOptions(), timeZone: appZone() })}` : undefined}>
            Overdue {r.late}d
          </span>
        ) : (
          <>
            {tag && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: tag.color ?? 'var(--acc-moss)' }} />}
            {t.duration_min != null && <span>{formatDuration(t.duration_min)}</span>}
          </>
        )}
      </span>
      <span className="cal-row-acts">
        <PlanButton title={t.title} onPlan={onPlan} />
        {/* Conductor review 2026-10-12: ⋯ on every task row — the one task menu, as right-click
            opens it. dragGuard'd like Plan ▾, so pressing it never picks the row up. */}
        <span
          style={{ display: 'inline-flex', flex: 'none' }}
          ref={(el) =>
            dragGuard(() => {
              if (!el) return
              const r = el.getBoundingClientRect()
              grammar.openMenu({ x: r.left, y: r.bottom })
            })(el)
          }
        >
          <RowMenuButton title={t.title} onOpen={() => {}} />
        </span>
      </span>
      {grammar.menuNode}
    </div>
  )
}

function RailInboxCard({ item, onPlan }: { item: InboxItem; onPlan: (x: number, y: number) => void }) {
  const title = inboxTitle(item)
  return (
    <div className="unscheduled-task" data-inbox-id={item.id} data-title={title} data-duration={inboxMinutes(item)} data-length={durationLabel(inboxMinutes(item))} title={title}>
      <Icon name="inbox" size={15} style={{ flex: 'none', color: 'var(--ink-faint)' }} />
      <span className="cal-row-title"><EmojiText text={title} /></span>
      <span className="cal-row-meta">Inbox</span>
      <span className="cal-row-acts">
        <PlanButton title={title} onPlan={onPlan} />
      </span>
    </div>
  )
}

/** Phones (< 768px) get the touch calendar; desktop keeps the FullCalendar layout below. */
export function CalendarPage() {
  return useIsMobile() ? <PhoneCalendar /> : <DesktopCalendar />
}

function DesktopCalendar() {
  const openTask = useOpenTask()
  const navigate = useNavigate()
  const startFocus = useStartFocus()
  // Repeating events (migration 0061) are expanded twice over: `events` covers the year around
  // today (the rail, Plan's free slots, the footer); `gridEvents` the range the grid shows, wherever
  // it was paged to. Clicks, drags and the popover act on the grid's.
  const { data: events = [] } = useCalendarEvents()
  const { data: rows = [] } = useCalendarRows()
  const { data: tasks = [], isPending: tasksPending } = useTasks()
  const { data: settings } = useAppSettings()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const gridRef = useRef<CalendarGridHandle>(null)
  const gridWrapRef = useRef<HTMLDivElement>(null)
  // CALENDAR.md §7 pending / sync-failed block states, straight from the outbox.
  const outboxMarks = useOutboxMarks('calendar_events')
  const [selected, setSelected] = useState<Selected | null>(null)
  // Kai 2026-10-06: a search hit for an event opened this week, wherever the event was.
  // /calendar?event=<id> turns the grid to its day and opens its details (once it's loaded) — a
  // repeating event's next occurrence. The popover opens once the grid has drawn the block there
  // (two frames: the turn's scroll would otherwise close it at once).
  const linked = useLinkedEvent(rows)
  const [linkOpen, setLinkOpen] = useState<CalendarEvent | null>(null)
  if (linked.open) setLinkOpen(linked.open)
  useEffect(() => {
    if (!linkOpen) return
    gridRef.current?.gotoDate(new Date(linkOpen.starts_at))
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        setSelected({ id: linkOpen.id, start: linkOpen.starts_at, at: anchorOf(linkOpen.id) })
        setLinkOpen(null)
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [linkOpen])
  const [contextMenu, setContextMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  // Time Slots (0073): ⋯ on a task row inside a slot — that task's own menu (Out of the slot…).
  const [slotMenu, setSlotMenu] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const slotMenuTask = slotMenu ? tasks.find((t) => t.id === slotMenu.taskId) : undefined
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)
  // The Lists section (folded by default): any smart list / project / area / domain, minus what
  // Overdue and Today already hold. This Week by default — Today has its own section now.
  const [scope, setScope] = useState<RailScope>({ kind: 'smart', id: 'week' })
  const [viewKind, setViewKind] = useState<ViewKind>('week')
  // Effects 21 — the chip created by a rail drop plays settle-in once.
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [rangeInfo, setRangeInfo] = useState<{ title: string; start: Date; end: Date } | null>(null)
  // A week either side: month view draws its neighbours' days too.
  // S4 (2026-10-22 audit): snapped to whole weeks (from the Unix epoch's Thursday — any fixed week works), so
  // paging inside the window keeps the same query and its events array: one grid pass a page, not two.
  const WEEK_MS = 7 * DAY_MS
  const gridFrom = rangeInfo ? Math.floor((rangeInfo.start.getTime() - 7 * DAY_MS) / WEEK_MS) * WEEK_MS : null
  const gridTo = rangeInfo ? Math.ceil((rangeInfo.end.getTime() + 7 * DAY_MS) / WEEK_MS) * WEEK_MS : null
  const gridRange = useMemo(() => (gridFrom != null && gridTo != null ? { start: new Date(gridFrom), end: new Date(gridTo) } : undefined), [gridFrom, gridTo])
  const { data: gridEvents = [] } = useCalendarEvents(gridRange)
  // Punch 32 — view-options popover (⚟ trigger) + its per-device preferences.
  const [viewOpts, setViewOpts] = useState<CalViewOptions>(readViewOptions)
  const [viewOptsOpen, setViewOptsOpen] = useState(false)
  // Anchor survives the close so the 140ms exit plays in place (useOverlayExit keeps it mounted).
  const [viewOptsAnchor, setViewOptsAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const viewOptsExit = useOverlayExit(viewOptsOpen)

  // Polish F2b: a tab left open past midnight rolls over by itself. The grid follows the new day
  // only when it was showing the day that just ended — a range paged to with ‹ › stays put.
  // `today` (the day stamp) re-renders this page, so the rail's Today list and footer re-read too.
  const today = useDayRollover((previous) => {
    if (rangeInfo && previous >= rangeInfo.start && previous < rangeInfo.end) gridRef.current?.today()
  })
  // Kai 2026-10-07: the rail is Akiflow's planning sidebar — Overdue (incl. a block missed on an
  // earlier day) · Today (no time yet) · Inbox (un-triaged captures), then the old scoped Lists.
  const { data: inbox = [] } = usePendingInboxItems()
  const buckets = useMemo(() => railBuckets(tasks, events, new Date()), [tasks, events, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // cal-wave item 18: today's tasks already on the calendar, with their times.
  const scheduled = useMemo(() => scheduledToday(tasks, events, new Date()), [tasks, events, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const inRail = new Set([...buckets.overdue, ...buckets.today].map((r) => r.task.id))
  const listTasks = filterByScope(tasks, scope).filter((t) => !t.scheduled_start && !inRail.has(t.id))
  const toPlan = buckets.overdue.length + buckets.today.length + inbox.length
  const [sections, setSections] = useState<Record<RailSection, boolean>>(readSections)
  function toggleSection(k: RailSection) {
    setSections((s) => {
      const next = { ...s, [k]: !s[k] }
      try {
        localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next))
      } catch {
        /* private mode — the fold lasts this visit */
      }
      return next
    })
  }
  // Kai 2026-10-13 (phone parity audit): the daisy's stage reads the user's clock, not the device's.
  const daisy = daisyAsset(zoneHour())
  const motionOn = useMotionEnabled()
  const conflicts = useMemo(() => conflictsOf(gridEvents, appZone()), [gridEvents])
  // p7e A15: "Show weekends" off hides the user's own weekend (lib/weekend), not Sat + Sun. J-15: the
  // grid gets the SAME array while it's unchanged — a fresh one each render read to FullCalendar as a
  // changed option → datesSet → setRangeInfo → re-render… (max update depth). No weekend, or all
  // seven days (FullCalendar can't hide every day), hides nothing.
  const weekendKey = parseWeekend(settings?.weekend_days).join()
  const weekend = useMemo(() => (weekendKey ? weekendKey.split(',').map(Number) : []), [weekendKey])
  const hiddenWeekend = viewOpts.showWeekends || weekend.length >= 7 ? [] : weekend
  // Kai 2026-10-03: Settings → Calendar → "Opens on" (synced; unset = Week here). Applied once, when
  // the settings row arrives — a view picked after that is the person's own. '3 days' is the N-day
  // view held at 3 for this visit, without touching the popover's remembered N.
  const defaultView = useCalendarDefaultView('week')
  const [opened, setOpened] = useState(false)
  const [visitDays, setVisitDays] = useState<number | null>(null)
  if (defaultView && !opened) {
    setOpened(true)
    setViewKind(defaultView === 'day' ? 'day' : defaultView === '3day' ? 'ndays' : 'week')
    if (defaultView === '3day') setVisitDays(3)
  }
  const dayCount = visitDays ?? settings?.calendar_day_count ?? 4

  // The 24-hour switch is the app's one clock (lib/clock, Kai 2026-10-22): it lives in the shared store, so
  // Settings and every other surface follow it; the rest of the view options stay this page's.
  const h24 = useHour24()
  function patchViewOpts(patch: Partial<CalViewOptions>) {
    if (patch.hour24 !== undefined) setHour24(patch.hour24)
    setViewOpts((v) => {
      const next = { ...v, ...patch, hour24: patch.hour24 ?? hour24() }
      writeViewOptions(next)
      return next
    })
  }

  // The popover's Akiflow view row: 1 = day, 2–6 = N-day, W = week, M = month.
  const activeViewCell: ViewCell = viewKind === 'day' ? '1' : viewKind === 'week' ? 'W' : viewKind === 'month' ? 'M' : (String(Math.min(6, Math.max(2, dayCount))) as ViewCell)
  function pickView(cell: ViewCell) {
    if (cell === '1') setViewKind('day')
    else if (cell === 'W') setViewKind('week')
    else if (cell === 'M') setViewKind('month')
    else {
      updateAppSetting('calendar_day_count', Number(cell))
      setVisitDays(null)
      setViewKind('ndays')
    }
  }

  // Punch 32 "Show completed": done task-blocks drop out of the grid when toggled off.
  const doneTaskIds = useMemo(() => new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id)), [tasks])
  // Subtasks C: a subtask's block → its parent's title ("↳ parent" on the block).
  const parentTitleOf = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t] as const))
    return (taskId: string | null) => {
      const pid = taskId ? byId.get(taskId)?.parent_task_id : null
      return pid ? (byId.get(pid)?.title ?? null) : null
    }
  }, [tasks])
  const visibleEvents = useMemo(() => (viewOpts.showCompleted ? gridEvents : gridEvents.filter((e) => !(e.task_id && doneTaskIds.has(e.task_id)))), [viewOpts.showCompleted, gridEvents, doneTaskIds])
  // An occurrence's pending write is its series row's. (S2: these never reach FullCalendar's data — the grid
  // marks the blocks' elements.)
  const pendingIds = useSameIds(visibleEvents.filter((e) => outboxMarks.pending.has(e.seriesId ?? e.id)).map((e) => e.id))
  const failedIds = useSameIds(visibleEvents.filter((e) => outboxMarks.failed.has(e.seriesId ?? e.id)).map((e) => e.id))
  const conflictedIds = useSameIds(Array.from(conflicts.keys()))
  // Goal A (Kai 2026-10-23): the goal of the day is the first of today's Top 3 (today/top3Order, as Tasks' ✶ Goal
  // chip reads it); only its block on today's date wears the gold edge and ✶.
  const goalTaskId = useMemo(() => goalIdOf(tasks, legacyGoalId(), cachedStarEvents()), [tasks, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // S1: the blocks as the grid takes them, rebuilt only when what they draw changes.
  const gridBlocks = useMemo(
    () => {
      const todayKey = cairoDateKey(new Date())
      return visibleEvents.map((e) => {
        // Time Slots (0073): a Time block draws the tasks it holds (this occurrence's) and its fill.
        const held = e.type === 'time_block' ? slotTasks(e, tasks) : []
        return {
          id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, allDay: e.all_day, type: e.type ?? 'event', color: e.color, linked: Boolean(e.task_id), taskId: e.task_id, taskDone: e.task_id ? doneTaskIds.has(e.task_id) : false, repeat: !!e.recurrence_rule, readOnly: isSynced(e), parent: parentTitleOf(e.task_id),
          goal: !!goalTaskId && e.task_id === goalTaskId && !e.all_day && cairoDateKey(new Date(e.starts_at)) === todayKey,
          ...(held.length ? { held: held.map((t) => ({ id: t.id, title: t.title, done: t.status === 'done', minutes: t.duration_min || 30 })), fill: slotFill(e, held) } : null),
        }
      })
    },
    [visibleEvents, tasks, doneTaskIds, parentTitleOf, goalTaskId, today], // eslint-disable-line react-hooks/exhaustive-deps -- today: a new day re-reads the goal's date
  )
  const selectedEvent = selected ? findBlock(gridEvents, selected.id, selected.start) ?? null : null

  const scopeValueOptions =
    scope.kind === 'smart'
      ? SMART_LISTS
      : scope.kind === 'project'
        ? projects.map((p) => ({ value: p.id, label: p.name }))
        : scope.kind === 'area'
          ? areas.map((a) => ({ value: a.id, label: a.name }))
          : domains.map((d) => ({ value: d.id, label: d.name }))

  function onScopeKindChange(kind: RailScopeKind) {
    if (kind === 'smart') { setScope({ kind, id: 'today' }); return }
    const options = kind === 'project' ? projects : kind === 'area' ? areas : domains
    setScope({ kind, id: options[0]?.id ?? '' })
  }

  // One Draggable on the rail's card container: it delegates to `.unscheduled-task`, so cards that
  // come and go (a section opened, a task planned) need no re-binding.
  useEffect(() => {
    if (!sidebarRef.current) return
    const draggable = cardDraggable(sidebarRef.current)
    return () => draggable.destroy()
  }, [])

  // ── Plan ▾ (a rail card's, an overdue block's Replan, the block menu's): Today · Next free slot ·
  // Tomorrow, first thing · Pick date…. A time puts it on the calendar (its block moves there —
  // never a second one); a date alone plans the day (calendar/replan has the rule). Conductor review
  // 2026-10-12: Today and Tomorrow mean what every other Plan menu means (Settings' glossary,
  // tasks/planMath): Today = today at the task's own time, else 09:00 (todayFor); Tomorrow =
  // tomorrow 09:00, the one Tomorrow (moveToTomorrowWithUndo — swipe right, the 2 key). ──
  const [plan, setPlan] = useState<{ target: PlanTarget; x: number; y: number } | null>(null)
  function planFor(target: PlanTarget): ContextMenuItem[] {
    const now = new Date()
    const dur = target.kind === 'task' ? railMinutes(target.r) : inboxMinutes(target.item)
    const title = target.kind === 'task' ? target.r.task.title : inboxTitle(target.item)
    const next = nextFreeSlot(events, now, dur)
    const at = (s: { starts_at: string; ends_at: string }) => {
      const d = new Date(s.starts_at)
      return cairoDateKey(d) === cairoDateKey(now) ? timeText(d) : `${dayHint(cairoDateKey(d), cairoDateKey(now))} ${timeText(d)}`
    }
    const place = (startsAt: string, endsAt: string) => {
      if (target.kind === 'task') scheduleTaskWithUndo(target.r.task, startsAt, endsAt)
      else fileToCalendar(target.item, startsAt, endsAt)
      gridRef.current?.gotoDate(new Date(startsAt)) // the 4am case: scroll to where it landed
    }
    const day = (iso: string) => {
      if (target.kind === 'inbox') fileToTask(target.item, { ...aiFiling(target.item), dueAt: iso })
      else toastUndo(`Planned · ${dayWord(iso)}`, rescheduleDue(target.r.task, iso))
    }
    return [
      { label: 'Today', icon: <Icon name="today" size={16} />, onClick: () => day(todayFor(target.kind === 'task' ? target.r.task : undefined, now)) },
      ...(next ? [{ label: `Next free slot · ${at(next)}`, icon: <Icon name="clock" size={16} />, onClick: () => place(next.starts_at, next.ends_at) }] : []),
      {
        label: 'Tomorrow, first thing',
        hint: tomorrowHint(now),
        icon: <Icon name="tomorrow" size={16} />,
        onClick: () => (target.kind === 'task' ? moveToTomorrowWithUndo([target.r.task]) : day(scheduleTomorrow(now))),
      },
      {
        label: 'Pick date…',
        icon: <Icon name="pickdate" size={16} />,
        submenu: ({ position, onClose, closeAll }) => (
          <DatePicker
            title="Plan"
            meta={title}
            value={null}
            quick
            withTime
            duration={dur}
            position={position}
            onPick={(iso, min, timed) => {
              if (timed) place(iso, new Date(Date.parse(iso) + (min ?? dur) * 60_000).toISOString())
              else day(iso)
              closeAll()
            }}
            onClose={onClose}
          />
        ),
      },
    ]
  }
  /** Replan a task's block (an overdue block's link, its right-click, the details panel). */
  function replanEvent(event: CalendarEvent, x: number, y: number) {
    const task = tasks.find((t) => t.id === event.task_id)
    if (task) setPlan({ target: { kind: 'task', r: { task, block: event, late: 0 } }, x, y })
  }

  /** §5: the block's popover, beside it (or at the pointer, from a right-click's Edit). */
  function openExisting(event: CalendarEvent, at?: { x: number; y: number }) {
    setSelected({ id: event.id, start: event.starts_at, at: at ?? anchorOf(event.id) })
  }

  // Multi-select (Kai 2026-10-22, Google / Notion Calendar): Ctrl / ⌘ / Shift + click picks blocks; dragging one
  // moves them all, Delete / Backspace takes them off with one Undo, Esc lets go. A plain click starts over.
  const [picked, setPicked] = useState<string[]>([])
  function handleEventClick(id: string, add?: boolean) {
    setContextMenu(null)
    if (add) {
      setSelected(null)
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
      return
    }
    setPicked([])
    const event = gridEvents.find((e) => e.id === id)
    if (event) openExisting(event)
  }
  const pickedLive = useMemo(() => picked.filter((id) => gridEvents.some((e) => e.id === id)), [picked, gridEvents])

  // Punch 6 (calendar slice): every destructive calendar mutation undoes through the same api — never a bare toast.
  const unscheduleWithUndo = (event: CalendarEvent) => deleteEventWithUndo(event, 'Unscheduled')
  const deleteWithUndo = (event: CalendarEvent) => deleteEventWithUndo(event, 'Deleted')

  function handleEventContextMenu(id: string, x: number, y: number) {
    setContextMenu(null)
    const event = gridEvents.find((e) => e.id === id)
    if (!event) return
    const items: ContextMenuItem[] = []
    if (event.type === 'task') {
      items.push({ label: 'Edit Task', onClick: () => { setContextMenu(null); openExisting(event, { x, y }) } })
      if (isMissed(event)) items.push({ label: 'Replan…', onClick: () => replanEvent(event, x, y) })
      items.push({ label: 'Complete', onClick: () => { setContextMenu(null); const t = tasks.find((t) => t.id === event.task_id); if (t) completeTaskWithUndo(t) } })
      items.push({ label: 'Unschedule', onClick: () => { setContextMenu(null); unscheduleWithUndo(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteWithUndo(event) } })
    } else if (isSynced(event)) {
      // A Google event (B1) is read-only: its details, nothing to delete.
      items.push({ label: 'Details', onClick: () => { setContextMenu(null); openExisting(event, { x, y }) } })
    } else {
      items.push({ label: 'Edit', onClick: () => { setContextMenu(null); openExisting(event, { x, y }) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteWithUndo(event) } })
    }
    setContextMenu({ items, x, y })
  }

  /** Punch 33 + Kai 2026-10-12: a block dragged onto the rail does what the section it lands on
   * means (railDrop.ts has the table) — Overdue, or a plain event off any section, is the soft-no. */
  function handleDragToRail(id: string, section: string | null): boolean {
    const event = gridEvents.find((e) => e.id === id)
    if (!event) return false
    return eventToRail(event, railDropAction(section, !!event.task_id), scopeTarget(scope, projects, areas))
  }

  /** slots-ux: a held task's row dragged onto the rail comes out of its slot — the section means what it
   * does for a task's block (railDrop.ts): Today also dates it today, Overdue is the soft-no. */
  function handleSlotTaskToRail(taskId: string, section: string | null): boolean {
    const task = tasks.find((t) => t.id === taskId)
    const action = task ? railDropAction(section, true) : 'soft-no'
    if (!task || action === 'soft-no') return false
    if (action === 'unschedule-today') toastUndo(`Out of the slot · ${task.title} · Today`, rescheduleDue(task, scheduleToday()))
    else outOfSlotWithUndo(task)
    return true
  }

  /** Punch 34: double-click on a task-linked block goes straight to the task editor. */
  function handleEventDoubleClick(id: string) {
    const event = gridEvents.find((e) => e.id === id)
    if (event?.task_id) openTask(event.task_id)
  }

  // Empty-slot click/drag → Editor 2a's quick-create popover, kind defaults to Event.
  // T-4 (Polish F2b): QuickCreate's fields are Cairo wall-clock; slotFields converts the slot so
  // the form shows the clicked time on Cairo's clock and saves that exact instant back.
  // p7e A4: with ⌘/Ctrl held it's a Task there (Akiflow's ⌘-click), its block on that slot.
  function handleGridCreate(info: { start: string; end: string; allDay: boolean; x: number; y: number; task?: boolean; dragged?: boolean }) {
    // The grid snaps to 15 min (Kai 2026-10-03), so a plain click selects one quarter; it still
    // makes the half-hour it always did. A drag keeps exactly what was dragged — one quarter too
    // (Kai 2026-10-21: a 15-minute drag used to come out 30).
    setPicked([])
    const startMs = new Date(info.start).getTime()
    const end = !info.allDay && !info.dragged && new Date(info.end).getTime() - startMs <= 15 * 60000 ? new Date(startMs + 30 * 60000).toISOString() : info.end
    setQuickCreate({
      kind: info.task ? 'task' : 'event',
      slot: slotFields(info.start, end, info.allDay),
      anchor: { x: info.x, y: info.y },
    })
  }

  // Right-click empty grid space → Editor 2a/2b, kind pre-picked from the menu.
  function handleGridContextMenu(iso: string, allDay: boolean, x: number, y: number) {
    function openKind(kind: QuickCreateKind) {
      setContextMenu(null)
      const end = new Date(new Date(iso).getTime() + (allDay ? 24 * 60 : 30) * 60000)
      setQuickCreate({
        kind,
        slot: slotFields(iso, end.toISOString(), allDay),
        anchor: { x, y },
      })
    }
    setContextMenu({
      items: [
        { label: 'New Event', onClick: () => openKind('event') },
        { label: 'New Time Block', onClick: () => openKind('block') },
      ],
      x,
      y,
    })
  }

  function openQuickAddTask(e: React.MouseEvent) {
    setQuickCreate({ kind: 'task', slot: null, anchor: { x: e.clientX, y: e.clientY } })
  }

  /** A ran-over task block that isn't done — the details panel and the right-click offer Replan. */
  function isMissed(event: CalendarEvent): boolean {
    const t = event.task_id ? tasks.find((x) => x.id === event.task_id) : undefined
    return !!t && t.status === 'todo' && Date.parse(event.ends_at) < Date.now()
  }

  // A rail card dropped on the grid: a task's block goes there (its missed block moves — never a
  // second one); an inbox item is filed and blocked there. Each with one Undo.
  function handleExternalDrop(from: { taskId?: string; inboxId?: string }, start: string, allDay: boolean) {
    const task = from.taskId ? tasks.find((t) => t.id === from.taskId) : undefined
    const item = from.inboxId ? inbox.find((i) => i.id === from.inboxId) : undefined
    // Time Slots (0073): a task dropped on a Time block goes IN it — no block of its own. A held row
    // dropped back on its own slot stays as it was.
    const slot = task && !allDay ? slotAt(gridEvents, start) : undefined
    if (task && slot) return inSlot(task, slot) ? undefined : putInSlotWithUndo(task, slot)
    const min = allDay ? 24 * 60 : task ? railMinutes(buckets.overdue.find((r) => r.task.id === task.id) ?? scheduled.find((r) => r.task.id === task.id) ?? { task, block: null }) : item ? inboxMinutes(item) : 30
    const end = new Date(new Date(start).getTime() + min * 60000).toISOString()
    const ev = task ? scheduleTaskWithUndo(task, start, end, allDay) : item ? fileToCalendar(item, start, end, allDay) : null
    if (!ev) return
    // Always reported, motion or not: CalendarGrid keeps this block visible until the next
    // interaction (Polish F2b). The settle-in it also drives is gated in CSS by .cal-motion-on.
    setJustDroppedId(ev.id)
    window.setTimeout(() => setJustDroppedId((cur) => (cur === ev.id ? null : cur)), 800)
  }

  // R4-16: rail width is user-controlled and remembered across sessions.
  const [railWidth, setRailWidth] = useState(() => {
    const stored = Number(localStorage.getItem(RAIL_W_KEY))
    return Number.isFinite(stored) && stored >= RAIL_MIN && stored <= RAIL_MAX ? stored : DEFAULT_RAIL_W
  })
  const [railDragging, setRailDragging] = useState(false)
  useEffect(() => {
    localStorage.setItem(RAIL_W_KEY, String(railWidth))
  }, [railWidth])

  // Polish D (2026-09-26 audit): at the default 125% interface size a 1280px window lays the
  // page out at ~1024px, and the 244px rail beside a week left two of seven days on screen.
  // Calendar.dc.html keeps the rail on desktop, so it stays wherever the week still fits beside
  // it; where it doesn't, it folds to a strip (the week gets the room) and one click brings it
  // back.
  const shellRef = useRef<HTMLDivElement>(null)
  const [shellWidth, setShellWidth] = useState(0)
  useEffect(() => {
    const el = shellRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setShellWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [railPref, setRailPref] = useState<'open' | 'folded' | null>(() => {
    try {
      const v = localStorage.getItem(RAIL_FOLD_KEY)
      return v === '1' ? 'folded' : v === '0' ? 'open' : null
    } catch {
      return null
    }
  })
  // Kai 2026-10-07: an overdue pile opens the rail by itself (that's what the calendar is for then);
  // the person's own fold still wins, and the folded tab shows the pile's count in terra.
  // cal-wave items 8 + 13: "Days fit the width" (Akiflow's Responsive) turns the N-day and Week views into as
  // many days as fit at RESPONSIVE_COL_W; a plain N-day view drops days before its columns would go under
  // MIN_COL_W (Week keeps its seven and scrolls — Kai 2026-07-21). Narrowing, the rail folds first (unless the
  // person opened or folded it themselves), then the days drop.
  const [railForced, setRailForced] = useState(false)
  const timeGridView = viewKind === 'week' || viewKind === 'ndays'
  const responsive = viewOpts.responsive && timeGridView
  const secondZone = viewOpts.secondZone && isZone(viewOpts.secondZone) ? viewOpts.secondZone : null
  const axisW = TIME_AXIS_W + (secondZone ? ZONE2_W : 0)
  const railOpenGrid = shellWidth - RAIL_SPLIT_W - railWidth
  // Narrower than GRID_MIN_W beside it, even a rail the person opened steps aside (the header and one day
  // need that much); the tab still opens it, for this visit, at that width (`railForced`).
  const railCramped = shellWidth > 0 && railOpenGrid < GRID_MIN_W
  const railFolded = railPref === 'folded' || (railCramped && !railForced)
    ? true
    : railPref === 'open' || railForced
      ? false
      : buckets.overdue.length === 0 && (responsive ? shellWidth > 0 && fitDays(railOpenGrid, RESPONSIVE_COL_W, 7, axisW) < 2 : railYields(shellWidth, railWidth, visibleDayCount(viewKind, dayCount, hiddenWeekend.length)))
  const gridWidth = shellWidth > 0 ? (railFolded ? shellWidth - RAIL_TAB_W : railOpenGrid) : 0
  const shownDays = responsive ? fitDays(gridWidth, RESPONSIVE_COL_W, 7, axisW) : viewKind === 'ndays' ? fitDays(gridWidth, MIN_COL_W, dayCount, axisW) : dayCount
  const daysView = responsive || viewKind === 'ndays'
  function setRailFolded(folded: boolean) {
    setRailForced(!folded && railCramped)
    setRailPref(folded ? 'folded' : 'open')
    try {
      localStorage.setItem(RAIL_FOLD_KEY, folded ? '1' : '0')
    } catch {
      /* private mode — the choice lasts this visit */
    }
  }

  // ── Calendar.dc.html §4 planning mode: the grid collapses to a thin agenda strip (one day from the
  // Day view, else two) and the unscheduled rail swells into the room. "The toggle is the drag handle
  // on the rail's right edge": its dots (a click), or the rail dragged past 60% of the calendar; on the
  // strip's left edge they bring the grid back. Remembered per device. Replaces the parked /planning board.
  const [planning, setPlanningState] = useState(() => {
    try {
      return localStorage.getItem(PLANNING_KEY) === '1'
    } catch {
      return false
    }
  })
  function setPlanning(on: boolean) {
    setPlanningState(on)
    setSelected(null)
    try {
      localStorage.setItem(PLANNING_KEY, on ? '1' : '0')
    } catch {
      /* private mode — it lasts this visit */
    }
  }

  // p7e A4 — Akiflow's calendar keys, listed in the ? sheet (lib/shortcuts CALENDAR_SHORTCUTS): d / 1 day,
  // 2–6 that many days, w / 7 week, m month, - = and ← → page, t today, 0 folds the rail. Never while
  // typing, nor while a menu, popover or dialog is open (lib/overlayStack). Letters also read by key
  // code, so an Arabic layout works (AppLayout's own Ctrl+K rule). Re-bound each render, as BlockMenu's ⌫.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || overlayCount() > 0) return
      if (pickedLive.length && (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        if (e.key !== 'Escape') deleteEventsWithUndo(pickedLive.flatMap((id) => gridEvents.filter((x) => x.id === id)))
        setPicked([])
        return
      }
      const key = /^[\x20-\x7e]$/.test(e.key) ? e.key.toLowerCase() : (/^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? /^Digit(\d)$/.exec(e.code)?.[1] ?? e.key)
      const grid = gridRef.current
      const run: Record<string, (() => void) | undefined> = {
        d: () => pickView('1'), 1: () => pickView('1'),
        2: () => pickView('2'), 3: () => pickView('3'), 4: () => pickView('4'), 5: () => pickView('5'), 6: () => pickView('6'),
        w: () => pickView('W'), 7: () => pickView('W'), m: () => pickView('M'),
        '-': () => grid?.prev(), ArrowLeft: () => grid?.prev(), '=': () => grid?.next(), ArrowRight: () => grid?.next(),
        t: () => grid?.today(),
        0: planning ? undefined : () => setRailFolded(!railFolded),
      }
      const act = run[key]
      if (!act) return
      e.preventDefault()
      act()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stripDays = viewKind === 'day' ? 1 : 2
  const planRef = useRef<HTMLDivElement>(null)
  // S9: the page re-renders on the minute only in planning mode (its strip head and free gaps); the rail
  // footer and the day tray read the clock themselves.
  const planMinute = useMinuteClock((s) => (planning ? s.now : 0))
  const minuteNow = useMemo(() => (planMinute ? new Date(planMinute) : new Date()), [planMinute])
  const stripStart = rangeInfo ? cairoDateKey(rangeInfo.start) : cairoDateKey(minuteNow)
  const stripKeys = stripDays === 1 ? [stripStart] : [stripStart, addDays(stripStart, 1)]
  const stripKeysKey = stripKeys.join()
  const gaps = useMemo(() => (planning ? stripKeysKey.split(',').flatMap((d) => freeGaps(events, d, minuteNow)) : undefined), [planning, stripKeysKey, events, minuteNow])
  // cal-wave item 13 "Hours fit the day" (Akiflow's Dynamic): the shown days' blocks set the hours drawn.
  const rangeFirst = rangeInfo ? cairoDateKey(rangeInfo.start) : null
  const rangeLast = rangeInfo ? cairoDateKey(new Date(rangeInfo.end.getTime() - 1)) : null
  const dynHours = useMemo(() => {
    if (!viewOpts.dynamic || planning || viewKind === 'month' || !rangeFirst || !rangeLast) return null
    const days: string[] = []
    for (let d = rangeFirst; d <= rangeLast && days.length < 7; d = addDays(d, 1)) days.push(d)
    const [lo, hi] = fitHours(visibleEvents, days, cairoDateKey, (d) => {
      const [h, m] = zoneTimeKey(d).split(':').map(Number)
      return h + m / 60
    })
    return { min: `${String(lo).padStart(2, '0')}:00:00`, max: `${String(hi).padStart(2, '0')}:00:00` }
  }, [viewOpts.dynamic, planning, viewKind, rangeFirst, rangeLast, visibleEvents])
  /** The Now card's click: the block's details, the grid turned to its day first if it isn't shown. */
  function openFromNow(e: CalendarEvent) {
    if (rangeInfo && Date.parse(e.starts_at) >= rangeInfo.start.getTime() && Date.parse(e.starts_at) < rangeInfo.end.getTime()) openExisting(e)
    else setLinkOpen(e)
  }
  const nowCardOn = viewOpts.nowCard && !planning
  const nowCard = nowCardOn && <NowCard events={events} tasks={tasks} onOpen={openFromNow} variant={railFolded ? 'float' : 'dock'} />
  // The rail footer (p7e A15): busy blocks today, and the free time left inside 08:00–20:00 from now —
  // Free events, past time and off-hours aren't free time (the planning strip's own footer rule).
  function startRailDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return // J-4a: a right-button drag used to resize the rail
    e.preventDefault()
    const startX = e.clientX
    const startW = railWidth
    setRailDragging(true)
    // S3 (2026-10-22 audit: 40 moves took 26.7 s — two grid passes a move): while it moves, the width is
    // written on the rail itself, one write a frame (a variable on the shell restyled the whole page each
    // move); React hears of it once, on release.
    const rail = railRef.current
    let next = startW
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startW + (ev.clientX - startX)))
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => rail?.style.setProperty('width', `${next}px`))
    }
    // Kai 2026-10-22 ("it shows a new foreign state"): the splitter only resizes — letting go past 60%
    // of the calendar no longer swaps in planning mode (View options ▸ Planning mode does, by name).
    const onUp = () => {
      cancelAnimationFrame(raf)
      flushSync(() => setRailWidth(next))
      rail?.style.removeProperty('width')
      setRailDragging(false)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = ""
    }
    // The grid and the cards below would otherwise select text as the pointer sweeps them.
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  // §4 4a / 4b: the strip's own header — the day (daisy · "Today · Fri" · "Jul 10") or the two days.
  const stripDelta = Math.round((Date.parse(stripStart) - Date.parse(cairoDateKey(minuteNow))) / 86_400_000)
  const dayName = (key: string, o: Intl.DateTimeFormatOptions) => noon(key).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  const stripHead = (
    <div className="cal-strip-head">
      {stripDays === 1 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src={`/ds/assets/daisy/${daisyColumnStage(stripDelta, zoneHour(minuteNow))}.png`} alt="" style={{ height: 36, filter: 'var(--rim-lavender, var(--shadow-drop-sm))' }} />
            <div>
              <div className="cal-strip-kicker">{stripDelta === 0 ? `Today · ${dayName(stripStart, { weekday: 'short' })}` : dayName(stripStart, { weekday: 'long' })}</div>
              <div className="cal-strip-date">{dayName(stripStart, { month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="secondary" className="cal-strip-pill" onClick={() => gridRef.current?.today()}>Today</Button>
            {stripDelta !== 0 && <Button variant="secondary" className="cal-strip-nav" aria-label="Previous day" onClick={() => gridRef.current?.prev()}>‹</Button>}
            <Button variant="secondary" className="cal-strip-nav" aria-label="Next day" onClick={() => gridRef.current?.next()}>›</Button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="secondary" className="cal-strip-nav" aria-label="Previous two days" onClick={() => gridRef.current?.prev()}>‹</Button>
            <div className="cal-strip-range">{stripKeys.map((k) => `${dayName(k, { weekday: 'short' })} ${Number(k.slice(8))}`).join(' — ')}</div>
            <Button variant="secondary" className="cal-strip-nav" aria-label="Next two days" onClick={() => gridRef.current?.next()}>›</Button>
          </div>
          <Button variant="secondary" className="cal-strip-pill" onClick={() => gridRef.current?.today()}>Today</Button>
        </>
      )}
    </div>
  )

  // S1: the grid's handlers, stable across renders (each reads the latest render's state when it runs).
  const grid = useStableHandlers({
    onRangeChange: (info: { title: string; start: Date; end: Date }) => setRangeInfo(info),
    onSlotTaskMenu: (taskId: string, x: number, y: number) => setSlotMenu({ taskId, x, y }),
    onSlotTaskOpen: (taskId: string, el: Element) => openTask(taskId, undefined, el),
    onSlotTaskOut: (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId)
      if (t) outOfSlotWithUndo(t)
    },
    onSlotTaskToRail: (taskId: string, section: string | null) => handleSlotTaskToRail(taskId, section),
    onCompleteTask: (taskId: string, done: boolean) => {
      const t = tasks.find((x) => x.id === taskId)
      if (!t) return
      if (done) uncompleteTask(t)
      else completeTaskWithUndo(t)
    },
    // A task block's ▶ (hover, "Now" as drawn): Focus on its task, as Today's ▶ does.
    onFocusTask: (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId)
      if (t) startFocus(t)
    },
    onCreate: (info: { start: string; end: string; allDay: boolean; x: number; y: number; task?: boolean; dragged?: boolean }) => handleGridCreate(info),
    // One occurrence of a repeat moves on its own (calendar/api detach); the Undo comes back from the write.
    onMove: (id: string, start: string, end: string, allDay: boolean) => {
      const event = gridEvents.find((e) => e.id === id)
      if (!event) return
      // A task's block dropped on a Time block: the task goes into the slot, its block comes off.
      const task = event.task_id && !allDay ? tasks.find((t) => t.id === event.task_id) : undefined
      const slot = task ? slotAt(gridEvents, start, id) : undefined
      if (task && slot) return putInSlotWithUndo(task, slot)
      toastUndo(`Moved · ${event.title}`, moveOrResizeEvent(event, start, end, allDay))
    },
    onResize: (id: string, start: string, end: string) => {
      const event = gridEvents.find((e) => e.id === id)
      if (event) toastUndo(`Resized · ${event.title}`, resizeEvent(event, start, end))
    },
    onEventClick: (id: string, add?: boolean) => handleEventClick(id, add),
    onMoveMany: (ids: readonly string[], delta: number) => {
      moveEventsByWithUndo(ids.flatMap((id) => gridEvents.filter((x) => x.id === id)), delta)
      return true
    },
    onEventDoubleClick: (id: string) => handleEventDoubleClick(id),
    onExternalDrop: (from: { taskId?: string; inboxId?: string }, start: string, allDay: boolean) => handleExternalDrop(from, start, allDay),
    onReplan: (id: string, x: number, y: number) => {
      const event = gridEvents.find((e) => e.id === id)
      if (event) replanEvent(event, x, y)
    },
    onDragToRail: (eventId: string, section: string | null) => handleDragToRail(eventId, section),
    onEventContextMenu: (id: string, x: number, y: number) => handleEventContextMenu(id, x, y),
    onGridContextMenu: (iso: string, allDay: boolean, x: number, y: number) => handleGridContextMenu(iso, allDay, x, y),
  })
  // M2: the block popover and quick create play their way out (100ms) after their state is cleared.
  const blockExit = useOverlayExit(!!(selected && selectedEvent), 100)
  const blockShown = useKept(selected && selectedEvent ? { sel: selected, event: selectedEvent } : null, blockExit.mounted)
  const qcExit = useOverlayExit(!!quickCreate, 100)
  const qcShown = useKept(quickCreate ? { ...quickCreate, key: JSON.stringify([quickCreate.kind, quickCreate.slot, quickCreate.anchor]) } : null, qcExit.mounted)

  return (
    <>
      <style>{`
        .cal-shell { display: flex; align-items: stretch; height: 100%; min-height: 0; }
        .cal-rail { width: var(--cal-rail-w, 244px); flex: none; border-right: 1px solid var(--line-card); display: flex; flex-direction: column; padding: 14px 14px 10px; overflow-y: auto; }
        .cal-railsplit { flex: none; width: 7px; cursor: col-resize; position: relative; }
        .cal-railsplit::after { content: ""; position: absolute; inset: 0 3px; background: transparent; transition: background var(--dur-quick); }
        .cal-railsplit:hover::after, .cal-railsplit[data-dragging]::after { background: var(--acc-lavender); }
        /* Polish D: the folded rail — a strip with the sidebar's own round collapse button
           (AppLayout's .kf-collapse-btn look) and the rail's own mono label, read upward. */
        .cal-rail.is-folded { display: none; }
        .cal-rail-tab { flex: none; width: 34px; border: none; border-right: 1px solid var(--line-card); background: none; padding: 18px 0; display: flex; flex-direction: column; align-items: center; gap: 14px; cursor: pointer; font: inherit; color: var(--ink-faint); }
        .cal-rail-knob { flex: none; width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid var(--line-card); background: var(--paper-parchment); box-shadow: var(--shadow-crisp); color: var(--ink-faint); font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .cal-rail-tab-label { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-meta); color: var(--ink-faint); white-space: nowrap; }
        .cal-rail-tab:hover .cal-rail-tab-label { color: var(--ink-muted); }
        .cal-railsplit .cal-rail-knob { position: absolute; top: 18px; left: -9px; z-index: 2; }
        .cal-rail-cards { display: flex; flex-direction: column; gap: 0; }
        /* Kai 2026-10-07: Overdue · Today · Inbox · Lists, each folding on its own header. */
        .cal-rail-secs { display: flex; flex-direction: column; gap: 10px; }
        .cal-rail-sec-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 0; margin-bottom: 2px; border: none; background: none; cursor: pointer; font: inherit; font-family: var(--font-ui); font-size: var(--fs-body-s); font-weight: var(--fw-semibold); color: var(--ink-muted); text-align: left; }
        .cal-rail-sec-head:hover { color: var(--ink-body); }
        .cal-rail-sec-head:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 4px; }
        .cal-rail-sec-count { margin-left: auto; color: var(--ink-faint); }
        /* Kai 2026-10-12: a block dragged over a section that takes it — the grid's own drop-target
           look (.fc-highlight). Overdue never takes one (it's computed), so it never lights. */
        .cal-rail-sec[data-drop-over]:not([data-section="overdue"]):not([data-section="scheduled"]) { background: var(--fc-highlight-color, color-mix(in srgb, var(--acc-lavender) 16%, transparent)); outline: 1px dashed var(--acc-lavender); outline-offset: 3px; border-radius: 4px; }
        /* Plan ▾ is the kit's B secondary (bone, no outline, 12px), sized for the one-line row. A hovered
           row is bone too, so there the button steps up to parchment to keep its edge. */
        .cal-head-nav.kf-button { width: 36px; padding: 9px 0; justify-content: center; }
        .cal-plan-btn.kf-button { margin-left: auto; flex: none; gap: 4px; padding: 3px 9px; font-size: var(--fs-meta); }
        .unscheduled-task:hover .cal-plan-btn.kf-button { background-color: var(--paper-parchment); }
        /* Motion 5b "drag lift" — the one grammar for every draggable, matching lib/motion's
           dragLift(): pick-up 140ms to scale 1.04 / +1.2deg under a 14/30 shadow, release
           settles back over 320ms with the spring overshoot. At rest a row never tilts (B, D7).
           Motion 4a hover/press rides the same transition. */
        /* Kai 2026-10-14 (Akiflow's list beside its calendar): one line per task — box · title ·
           project dot · length; Plan ▾ and ⋯ take the meta's place on hover or focus. No card, no
           tilt: the rail is a tool. */
        .unscheduled-task {
          cursor: grab;
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          padding: 3px 6px;
          margin: 0 -6px;
          border-radius: var(--radius-input);
        }
        @media (hover: hover) { .unscheduled-task:hover { background: var(--paper-bone); } }
        /* Kai 2026-10-17: a card opens its task on a click or Enter (./cardOpen) — so it takes focus. */
        .unscheduled-task:focus-visible { outline: none; box-shadow: var(--focus-ring); }
        .cal-row-title { flex: 1; min-width: 0; font-size: var(--fs-body-s); color: var(--ink-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cal-row-meta { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-meta); color: var(--ink-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .cal-row-acts { flex: none; display: inline-flex; align-items: center; gap: 2px; }
        @media (hover: hover) {
          .unscheduled-task .cal-row-acts { display: none; }
          .unscheduled-task:hover .cal-row-acts, .unscheduled-task:focus-within .cal-row-acts { display: inline-flex; }
          .unscheduled-task:hover .cal-row-meta, .unscheduled-task:focus-within .cal-row-meta { display: none; }
        }
        /* M6 (2026-10-22): the press no longer lifts the row in place — the lift is the card's under the
           pointer (cardDrag, CalendarGrid.css), once. */
        .unscheduled-task:active { cursor: grabbing; }
        /* Kai 2026-10-21 (slot-outline A, ./cardDrag): while its lifted copy is out, a card's place stays a
           quiet dashed outline — the held rows' rule — never a second copy lifted in place. */
        .unscheduled-task[data-lifted] { outline: 1px dashed var(--ink-hairline); outline-offset: -1px; border-color: transparent; background: transparent; box-shadow: none; }
        .unscheduled-task[data-lifted] > * { visibility: hidden; }
        .cal-main { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 0; }
        /* cal-wave item 8: the header keeps one line at any width — the week/daisy note goes first, then the
           date steps down a size, then the controls tighten; the date ellipsizes only as a last resort. */
        .cal-head { container-type: inline-size; flex-wrap: nowrap; }
        .cal-head-date { display: flex; flex-direction: row-reverse; align-items: center; gap: 10px; min-width: 0; margin-left: 16px; text-align: right; }
        .cal-head-kicker { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-meta); font-variant-numeric: tabular-nums; color: var(--ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cal-head-h1 { margin: 2px 0 0; font-family: var(--font-display); font-weight: var(--fw-medium); font-size: var(--fs-display-m); line-height: 1.05; letter-spacing: var(--ls-display); color: var(--ink-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cal-head-ctrls { flex: none; display: flex; align-items: center; gap: 10px; }
        @container (max-width: 620px) { .cal-head-kicker, .cal-head-daisy { display: none; } .cal-head-h1 { margin: 0; } }
        @container (max-width: 470px) { .cal-head-h1 { font-size: var(--fs-body-l); } .cal-head-ctrls { gap: 6px; } }
        .cal-head-short { display: none; }
        @container (max-width: 380px) { .cal-head-long { display: none; } .cal-head-short { display: inline; } }
        @container (max-width: 380px) { .cal-head-ctrls .kf-button { padding-left: 10px; padding-right: 10px; } .cal-head-ctrls .cal-head-nav.kf-button { width: 28px; padding: 9px 0; } }
        @container (max-width: 300px) { .cal-head-date { margin-left: 6px; } .cal-head-ctrls { gap: 4px; } .cal-head-ctrls .kf-button:not(.cal-head-nav) { padding-left: 8px; padding-right: 8px; } }
        /* cal-wave item 18: empty sections step aside (back while a block is dragged — they still take drops). */
        .cal-rail-sec[data-empty] { display: none; }
        body:has(> #kf-cal-ghost) .cal-rail-sec[data-empty] { display: block; }
        body:has(> #kf-cal-ghost) .cal-rail-none { display: none; }
        .cal-rail-none { margin: 4px 0 0; font-size: var(--fs-body-s); color: var(--ink-faint); }
        .cal-row-at { font-family: var(--font-mono); font-size: var(--fs-mono-l); }
        /* cal-wave item 19: the Now card at the foot of the rail (the list scrolls behind it), or floating
           16px in from the grid's bottom-left corner when the rail is folded. */
        .cal-now-dock { position: sticky; bottom: -10px; z-index: 3; margin: auto -2px -10px; padding: 16px 2px 12px; background: linear-gradient(transparent, var(--bg-app) 22px); }
        .cal-now-float .kf-now-quiet { display: inline-flex; max-width: 100%; box-sizing: border-box; padding: 0 10px; background: var(--paper-parchment); border: 1px solid var(--line-card); border-radius: var(--radius-block); box-shadow: var(--shadow-panel); }
        .cal-now-float { position: absolute; left: 16px; bottom: 16px; z-index: 8; width: min(280px, calc(100% - 32px)); }
        /* Kai 2026-10-14: the per-day tray under the grid (Akiflow). */
        .cal-tray { position: relative; flex: none; border-top: 1px solid var(--line-card); background: var(--paper-parchment); overflow: hidden; }
        .cal-tray-fold { position: absolute; left: 0; top: 0; bottom: 0; display: flex; align-items: flex-start; justify-content: center; padding: 8px 0 0; border: none; background: none; color: var(--ink-faint); cursor: pointer; }
        .cal-tray-fold:hover { color: var(--ink-body); }
        .cal-tray-fold:focus-visible { outline: none; box-shadow: var(--focus-ring); }
        .cal-tray-day { position: absolute; top: 0; bottom: 0; box-sizing: border-box; overflow-y: auto; padding: 4px 9px; border-left: 1px solid var(--line-card); }
        .cal-tray-day { container-type: inline-size; }
        /* a Week column is narrow: the title gets the room, the length and project dot go — and Plan ▾ / ⋯
           on hover too (Kai 2026-10-21): they took the title's place, so a press to drag the row landed on
           Plan ▾. A click still opens the task, a right-click its menu. */
        @container (max-width: 230px) { .cal-tray-day .cal-row-meta, .cal-tray-day .unscheduled-task .cal-row-acts { display: none; } }
        .cal-tray-count { display: block; padding-top: 5px; font-size: var(--fs-meta); color: var(--ink-faint); }
      `}</style>

      <div className="cal-shell" ref={shellRef} style={{ ['--cal-rail-w' as string]: `${railWidth}px` } as React.CSSProperties}>
        {railFolded && !planning && (
          <button
            type="button"
            className="cal-rail-tab"
            onClick={() => setRailFolded(false)}
            title="Show the planning rail"
            aria-label={`Show the planning rail (${buckets.overdue.length} overdue, ${buckets.today.length} today, ${inbox.length} in the inbox)`}
          >
            <span className="cal-rail-knob kf-collapse-btn" aria-hidden="true">›</span>
            {buckets.overdue.length > 0 ? (
              <span className="cal-rail-tab-label" style={{ color: 'var(--acc-terra)' }}>Overdue · {buckets.overdue.length}</span>
            ) : (
              <span className="cal-rail-tab-label">To plan · {toPlan}</span>
            )}
          </button>
        )}
        {/* Stays mounted while folded so the FullCalendar Draggable keeps its container. */}
        <aside className={railFolded || planning ? 'cal-rail is-folded' : 'cal-rail'} ref={railRef} aria-label="Planning rail">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)' }}>To plan</div>
            <RailLoad events={events} />
          </div>

          <div
            className="cal-rail-extra"
            onClick={openQuickAddTask}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, background: 'var(--paper-bone)', borderRadius: 'var(--radius-input)', padding: '0 10px', marginBottom: 8, cursor: 'pointer' }}
          >
            <span style={{ width: 14, height: 14, border: '1.5px solid var(--ink-hairline)', borderRadius: 4, flex: 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Quick add task…</span>
          </div>

          <div ref={sidebarRef} className="cal-rail-secs">
            {tasksPending ? (
              <Skeleton rows={3} />
            ) : (
              <>
                <RailSectionBox name="overdue" label="Overdue" count={buckets.overdue.length} terra folded={sections.overdue} onToggle={toggleSection} empty="Nothing overdue.">
                  {buckets.overdue.map((r) => (
                    <RailTaskCard key={r.task.id} r={r} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="today" label="Today" count={buckets.today.length} folded={sections.today} onToggle={toggleSection} empty="Nothing left without a time today.">
                  {buckets.today.map((r) => (
                    <RailTaskCard key={r.task.id} r={r} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="scheduled" label="Scheduled" count={scheduled.length} folded={sections.scheduled} onToggle={toggleSection} empty="Nothing on the calendar today.">
                  {scheduled.map((r) => (
                    <RailTaskCard key={r.task.id} r={r} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r }, x, y })} onJump={() => r.block && openFromNow(r.block)} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="inbox" label="Inbox" count={inbox.length} folded={sections.inbox} onToggle={toggleSection} empty="Inbox zero.">
                  {inbox.map((item) => (
                    <RailInboxCard key={item.id} item={item} onPlan={(x, y) => setPlan({ target: { kind: 'inbox', item }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="lists" label="Lists" count={listTasks.length} keep={!(scope.kind === 'smart' && scope.id === 'week')} folded={sections.lists} onToggle={toggleSection} empty="Nothing else here to block.">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Select
                      value={scope.kind}
                      onChange={(v) => onScopeKindChange(v as RailScopeKind)}
                      options={SCOPE_KIND_OPTIONS}
                      ariaLabel="Rail scope type"
                      style={{ fontSize: 'var(--fs-meta-l)', padding: '4px 6px', flex: 'none', maxWidth: 92 }}
                    />
                    <Select
                      value={scope.id}
                      onChange={(id) => setScope((s) => ({ ...s, id }))}
                      options={scopeValueOptions}
                      ariaLabel="Rail scope value"
                      style={{ fontSize: 'var(--fs-meta-l)', padding: '4px 6px', flex: 1, minWidth: 0 }}
                    />
                  </div>
                  {listTasks.map((task) => (
                    <RailTaskCard key={task.id} r={{ task, block: null, late: 0 }} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r: { task, block: null, late: 0 } }, x, y })} />
                  ))}
                </RailSectionBox>
                {/* cal-wave item 18: every section empty — one calm line instead of four zeros. */}
                {toPlan + scheduled.length + listTasks.length === 0 && scope.kind === 'smart' && scope.id === 'week' && <p className="cal-rail-none">Nothing to plan</p>}
              </>
            )}
          </div>
          {!railFolded && nowCard && <div className="cal-now-dock">{nowCard}</div>}

        </aside>

        {planning && (
          <PlanningPanel
            tasks={tasks}
            events={events}
            loading={tasksPending}
            projects={projects}
            domains={domains}
            areas={areas}
            days={stripKeys}
            now={minuteNow}
            daisy={daisy.src}
            panelRef={planRef}
            onPlan={(r, x, y) => setPlan({ target: { kind: 'task', r }, x, y })}
            onQuickAdd={openQuickAddTask}
            // Kai 2026-10-22: planning mode is entered and left by name (View options ▸ Planning mode /
            // this button), never by the pane handle.
            onLeave={() => setPlanning(false)}
          />
        )}

        {/* R4-16: drag to rebalance rail vs. grid; double-click restores the default. */}
        {!railFolded && !planning && (
          <div
            className="cal-railsplit"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize unscheduled panel"
            data-dragging={railDragging ? "" : undefined}
            onPointerDown={startRailDrag}
            onDoubleClick={() => setRailWidth(DEFAULT_RAIL_W)}
          >
            {/* Polish D: fold the rail away (the week takes the room). Its own pointer/dblclick
                events stay off the splitter so a click never starts a resize or a width reset. */}
            <button
              type="button"
              className="cal-rail-knob kf-collapse-btn"
              title="Hide unscheduled"
              aria-label="Hide unscheduled tasks"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => setRailFolded(true)}
            >
              ‹
            </button>
            {/* The splitter's grip: drawn only — a press drags the splitter, a double-click resets it. Kai
                2026-10-22: a click on it used to swap in planning mode. */}
            <span className="cal-plan-handle" aria-hidden="true" style={{ pointerEvents: 'none' }}>
              <i /><i /><i />
            </span>
          </div>
        )}

        <div className={planning ? 'cal-main cal-strip' : 'cal-main'}>
          {planning ? stripHead : (
          <div className="cal-head" style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 0, minHeight: 52, padding: '6px 14px 6px 16px', borderBottom: '1px solid var(--line-card)', flex: 'none' }}>
            {/* Kai 2026-10-14: the date and its daisy sit at the far top right, out of the grid's height. */}
            <div className="cal-head-date">
              {/* Night 1c: the header daisy is a silhouette lit at the rim in lavender. */}
              <img className="cal-head-daisy" src={`/ds/assets/daisy/${daisy.src}.png`} alt="" style={{ height: 36, filter: 'var(--rim-lavender, var(--shadow-drop-sm))' }} />
              <div style={{ minWidth: 0 }}>
                <div className="cal-head-kicker">{`Week ${weekNumber(rangeInfo?.start ?? new Date())} · ${daisy.note}`}</div>
                <h1 className="cal-head-h1">
                  <span className="cal-head-long">{rangeInfo ? rangeLabel(rangeInfo.start, rangeInfo.end, daysView ? 'ndays' : viewKind) : ''}</span>
                  <span className="cal-head-short">{rangeInfo ? rangeLabel(rangeInfo.start, rangeInfo.end, daysView ? 'ndays' : viewKind, true) : ''}</span>
                </h1>
              </div>
            </div>
            <div className="cal-head-ctrls">
              {/* Punch 32 [K-26]: the ⚟ view-options trigger replaces the segmented control +
                  N-day cycler — view switching now lives in the popover's 1–6/W/M row. */}
              {/* Bound Journal D11 = B: the header's controls are the kit's secondary button (bone, no outline, 12px). */}
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                aria-expanded={viewOptsOpen}
                // Stop the popover's document-level outside-mousedown from firing first —
                // otherwise a trigger click while open closes-then-reopens (toggle never closes).
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setViewOptsAnchor({ x: r.right, y: r.bottom })
                  setViewOptsOpen((v) => !v)
                }}
                style={{ gap: 6, userSelect: 'none' }}
                title={responsive ? 'Days fit the width (View options)' : undefined}
              >
                {viewKind === 'day' ? 'Day' : daysView ? `${shownDays} ${shownDays === 1 ? 'day' : 'days'}` : viewKind === 'week' ? 'Week' : 'Month'}
                {/* Kai 2026-10-03: the ⚟ glyph read as "≤" — the kit's dropdown chevron, as the phone's title uses. */}
                <Icon name="chevdown" size={14} style={{ color: 'var(--ink-muted)' }} />
              </Button>
              {/* p7e A4: real buttons (Tab reaches them; the kit's press + focus ring), keys - t = beside them. */}
              <Button variant="secondary" className="cal-head-nav" aria-label="Previous" title="Previous (- or ←)" onClick={() => gridRef.current?.prev()}>‹</Button>
              <Button variant="secondary" title="Today (t)" onClick={() => gridRef.current?.today()}>Today</Button>
              <Button variant="secondary" className="cal-head-nav" aria-label="Next" title="Next (= or →)" onClick={() => gridRef.current?.next()}>›</Button>
            </div>
          </div>
          )}

          <div
            className={[planning ? 'cal-strip-grid' : 'cal-grid-card', motionOn && 'cal-motion-on'].filter(Boolean).join(' ')}
            style={planning ? undefined : { flex: 1, minHeight: 0, background: 'var(--paper-parchment)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {/* Kai 2026-07-21: "why cant I scroll horizontally in the week view" — the grid
                keeps ≥170px per day column (CalendarGrid sets its own min-width) and scrolls
                sideways here instead of crushing the last day (today) into a sliver. */}
            <div ref={gridWrapRef} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0 }}>
            <CalendarGrid
              ref={gridRef}
              initialView={planning ? (stripDays === 1 ? 'timeGridDay' : 'customDayCount') : daysView ? 'customDayCount' : VIEW_MAP[viewKind]}
              hideToolbar
              events={gridBlocks}
              {...grid}
              pickedIds={pickedLive}
              railRef={planning ? planRef : railRef}
              hour24={h24}
              firstDay={viewOpts.weekStartsMon ? 1 : 0}
              hiddenDays={planning || !hiddenWeekend.length ? undefined : hiddenWeekend}
              density={viewOpts.density}
              justDroppedId={justDroppedId}
              dayCount={planning ? 2 : shownDays}
              slotMinTime={dynHours?.min}
              slotMaxTime={dynHours?.max}
              expandRows={!!dynHours}
              secondZone={planning ? null : secondZone}
              strip={planning}
              freeGaps={gaps}
              conflictedIds={conflictedIds}
              pendingIds={pendingIds}
              failedIds={failedIds}
            />
            </div>
            {!planning && viewKind !== 'month' && (
              <DayTray
                wrapRef={gridWrapRef}
                rangeKey={`${viewKind}|${shownDays}|${rangeInfo?.start.getTime() ?? 0}|${hiddenWeekend.join()}|${secondZone ?? ''}`}
                minWidth={gridMinWidth(visibleDayCount(daysView ? 'ndays' : viewKind, shownDays, hiddenWeekend.length), axisW)}
                tasks={tasks}
                events={events}
                domains={domains}
                projects={projects}
                areas={areas}
                onPlan={(r, x, y) => setPlan({ target: { kind: 'task', r }, x, y })}
              />
            )}
            </div>
          </div>
          {railFolded && nowCard && <div className="cal-now-float">{nowCard}</div>}
        </div>
      </div>

      {viewOptsExit.mounted && (
        <ViewOptionsPopover
          anchor={viewOptsAnchor}
          closing={viewOptsExit.closing}
          onClose={() => setViewOptsOpen(false)}
          activeView={activeViewCell}
          onPickView={pickView}
          value={{ ...viewOpts, hour24: h24 }}
          onChange={patchViewOpts}
          onPlanMode={() => {
            setViewOptsOpen(false)
            setPlanning(true)
          }}
        />
      )}
      {blockShown && (
        <BlockMenu
          key={blockShown.sel.id}
          event={blockShown.event}
          position={blockShown.sel.at}
          closing={blockExit.closing}
          onClose={() => setSelected(null)}
          onReplan={(x, y) => replanEvent(blockShown.event, x, y)}
        />
      )}
      {plan && <ContextMenu items={planFor(plan.target)} position={{ x: plan.x, y: plan.y }} onClose={() => setPlan(null)} />}
      {qcShown && (
        <QuickCreate
          key={qcShown.key}
          initialKind={qcShown.kind}
          slot={qcShown.slot}
          anchor={qcShown.anchor}
          closing={qcExit.closing}
          onClose={() => {
            setQuickCreate(null)
            gridRef.current?.unselect()
          }}
          // Editor 1b–1d: "More options ↗" is the full create page, with what was typed.
          onExpand={(draft) => {
            setQuickCreate(null)
            gridRef.current?.unselect()
            void navigate('/new', { state: { draft } })
          }}
        />
      )}
      {slotMenu && slotMenuTask && (
        <TaskMenu
          task={slotMenuTask}
          anchor={{ at: { x: slotMenu.x, y: slotMenu.y } }}
          onClose={() => setSlotMenu(null)}
          actions={taskActions(slotMenuTask)}
          ctx={{ tomorrowHint: tomorrowHint(), projectName: placeName(slotMenuTask, projects, areas, domains) }}
        />
      )}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
