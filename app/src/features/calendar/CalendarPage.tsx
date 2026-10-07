import { useEffect, useMemo, useRef, useState } from 'react'
import { useOpenTask } from '../tasks/openTask'
import { EmojiText } from '../../components/EmojiText'
import { Draggable } from '@fullcalendar/interaction'
import { CalendarGrid, type CalendarGridHandle, type CalendarGridView } from './CalendarGrid'
import { useCalendarEvents, moveOrResizeEvent, resizeEvent, scheduleTaskWithUndo, deleteEventWithUndo } from './api'
// Polish F2b (conductor decision 2026-09-26, punch 6): every calendar completion — the block's
// checkbox, its right-click Complete, the rail card's checkbox — toasts "Done" with Undo, the same
// completeTaskWithUndo the Tasks and Today lists use (a repeat's spawned next copy is taken back too).
import { useTasks, completeTaskWithUndo, uncompleteTask, rescheduleDue } from '../tasks/api'
import { useRowGrammar } from '../tasks/useRowGrammar'
import { aiFiling, fileToCalendar, fileToTask, inboxMinutes, inboxTitle, usePendingInboxItems } from '../inbox/api'
import { dayWord } from '../inbox/inboxDisplay'
import { nextFreeSlot, railBuckets, railMinutes, tomorrowFirst, type RailTask } from './replan'
import { DatePicker } from '../../components/DatePicker'
import { dayHint } from '../../components/pickerMath'
import { cairoDateKey, scheduleToday } from '../../lib/dateShortcuts'
import { appZone } from '../../lib/appZone'
import { useOutboxMarks } from '../../lib/outbox'
import { filterByScope, type RailScope, type RailScopeKind } from '../tasks/grouping'
import { Checkbox } from '../../components/kit'
import { dragGuard } from './dragGuard'
import { resolveTag, formatDuration } from '../tasks/taskDisplay'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useAppSettings, updateAppSetting, useCalendarDefaultView } from '../../lib/settings'
import { daisyAsset } from '../../lib/gardenAssets'
import { useMotionEnabled, useOverlayExit } from '../../lib/motion'
import { toastUndo } from '../../lib/undo'
import { localDateKey } from '../routines/streaks'
import { cairoTimeKey, slotFields } from './eventTime'
import { EventDetailsPanel } from './EventDetailsPanel'
import { useLinkedEvent } from './linkedEvent'
import { QuickCreate, type QuickCreateKind } from './QuickCreate'
import { ViewOptionsPopover, readViewOptions, writeViewOptions, type CalViewOptions, type ViewCell } from './ViewOptionsPopover'
import { railYields, visibleDayCount } from './weekFit'
import { useDayRollover } from './useDayRollover'
import { useIsMobile } from '../../components/BottomSheet'
import { PhoneCalendar } from './PhoneCalendar'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/States'
import type { ContextMenuItem } from '../../components/ContextMenu'
import type { Area, CalendarEvent, Domain, InboxItem, Project } from '../../lib/types'

const RAIL_W_KEY = 'kf.calRailWidth'
// Polish D: '1' = the user folded the Unscheduled rail, '0' = they opened it; unset = automatic
// (folded only when the visible days wouldn't keep their minimum width beside it — weekFit.ts).
const RAIL_FOLD_KEY = 'kf.calRailFolded'
const DEFAULT_RAIL_W = 244
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

const SMART_LIST_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'someday', label: 'Someday' },
]

function weekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

/** FullCalendar's range end is exclusive — subtract a day so a "last day" label reads right. */
function rangeLabel(start: Date, end: Date, viewKind: ViewKind): string {
  if (viewKind === 'month') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (viewKind === 'day') return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const lastDay = new Date(end.getTime() - 86400000)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = start.getMonth() === lastDay.getMonth() ? String(lastDay.getDate()) : lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} — ${endStr}`
}

/** Rough "how full is today" read for the rail footer — a 12h daytime window (9–21) minus
 * busy-block minutes. Not a real free/busy engine, just the botanical footer's one line. */
function todaysLoad(events: CalendarEvent[]): { blocked: number; freeHours: number } {
  const key = localDateKey(new Date())
  const todays = events.filter((e) => !e.all_day && localDateKey(new Date(e.starts_at)) === key)
  const busyMin = todays.filter((e) => e.busy).reduce((sum, e) => sum + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)
  return { blocked: todays.length, freeHours: Math.max(0, Math.round(12 - busyMin / 60)) }
}

/** Client-side conflict detection: only standalone Events get flagged. Time blocks and task-linked blocks are excluded. */
function computeConflicts(events: CalendarEvent[]): Map<string, string[]> {
  const eventType = events.filter((e) => e.type === 'event' && !e.all_day)
  const map = new Map<string, string[]>()
  for (let i = 0; i < eventType.length; i++) {
    for (let j = i + 1; j < eventType.length; j++) {
      const a = eventType[i], b = eventType[j]
      if (a.starts_at < b.ends_at && a.ends_at > b.starts_at) {
        if (!map.has(a.id)) map.set(a.id, [])
        if (!map.has(b.id)) map.set(b.id, [])
        map.get(a.id)!.push(b.title)
        map.get(b.id)!.push(a.title)
      }
    }
  }
  return map
}

interface QuickCreateState {
  kind: QuickCreateKind
  slot: { date: string; start: string; end: string; allDay: boolean } | null
  anchor: { x: number; y: number } | null
}

const RAIL_TILTS = [0, -0.4, 0, 0.4]
// J-15 (view-options interplay): one array for the whole module. A fresh `[0, 6]` every render
// read to FullCalendar as a changed option → new date profile → datesSet → setRangeInfo →
// re-render → another fresh array… "Show weekends" off crashed the page (max update depth).
const WEEKEND_DAYS = [0, 6]

// ── The planning rail's sections and cards (Kai 2026-10-07). ──

const RAIL_SECTIONS_KEY = 'kf.calRailSections'
type RailSection = 'overdue' | 'today' | 'inbox' | 'lists'
type PlanTarget = { kind: 'task'; r: RailTask } | { kind: 'inbox'; item: InboxItem }

/** Which sections the person folded (per device). Lists starts folded. */
function readSections(): Record<RailSection, boolean> {
  const base = { overdue: false, today: false, inbox: false, lists: true }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(RAIL_SECTIONS_KEY) ?? '{}') }
  } catch {
    return base
  }
}

const META: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const CARD: React.CSSProperties = { background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, padding: '11px 12px' }

function RailSectionBox({ name, label, count, terra, folded, onToggle, empty, children }: {
  name: RailSection
  label: string
  count: number
  terra?: boolean
  folded: boolean
  onToggle: (name: RailSection) => void
  empty: string
  children: React.ReactNode
}) {
  return (
    <section className="cal-rail-sec" data-section={name}>
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

/** Plan ▾ on a card: a dragGuard'd span, so pressing it never starts the card's drag. */
function PlanButton({ title, onPlan }: { title: string; onPlan: (x: number, y: number) => void }) {
  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    onPlan(r.left, r.bottom + 4)
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-label={`Plan ${title}`}
      className="cal-plan-btn"
      ref={(el) => dragGuard(() => el && open(el))(el)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        open(e.currentTarget)
      }}
    >
      Plan ▾
    </span>
  )
}

function RailTaskCard({ r, i, domains, projects, areas, onPlan }: { r: RailTask; i: number; domains: Domain[]; projects: Project[]; areas: Area[]; onPlan: (x: number, y: number) => void }) {
  const { task: t, block } = r
  // Right-click: the one task menu (Pick date… / Tomorrow route through rescheduleDue, so a missed
  // block moves or comes off with the replan); a missed block can also just be unscheduled.
  const grammar = useRowGrammar(t, { projects, domains, canUnschedule: !!block, actions: block ? { unschedule: () => deleteEventWithUndo(block, 'Unscheduled') } : undefined })
  const tag = resolveTag(t, domains, projects, areas)
  const missed = block ? new Date(block.starts_at) : null
  return (
    <div
      className="unscheduled-task"
      data-task-id={t.id}
      data-title={t.title}
      data-duration={railMinutes(r)}
      onContextMenu={grammar.onContextMenu}
      // Motion 5b (WB-1): the card's pasted-in tilt and its resting shadow live in CSS so the
      // pick-up lift can win the cascade — an inline transform / box-shadow can't be overridden by
      // a :active rule. FullCalendar's external Draggable never sets a dragging class on the
      // source card, so :active is the only pick-up signal available here.
      style={{ ['--kf-tilt' as string]: `${RAIL_TILTS[i % RAIL_TILTS.length]}deg`, ...CARD }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        {/* R4 (Kai 2026-07-20): tick a task off without scheduling it first. The guard swallows
            pointerdown so FullCalendar's Draggable never sees it. */}
        <span ref={dragGuard(() => completeTaskWithUndo(t))} style={{ display: 'inline-flex', marginTop: 1 }}>
          <Checkbox checked={false} size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--ink-body)', lineHeight: 1.35 }}><EmojiText text={t.title} /></div>
      </div>
      <div style={{ ...META, marginTop: 7, display: 'flex', alignItems: 'center', gap: 10 }}>
        {r.late > 0 ? (
          <span style={{ color: 'var(--acc-terra)' }} title={missed ? `Missed block: ${missed.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: appZone() })}` : undefined}>
            Overdue {r.late}d
          </span>
        ) : (
          <>
            {tag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--acc-moss)', flex: 'none' }} />
                {tag.label}
              </span>
            )}
            {t.duration_min != null && <span>{formatDuration(t.duration_min).toLowerCase()}</span>}
          </>
        )}
        <PlanButton title={t.title} onPlan={onPlan} />
      </div>
      {grammar.menuNode}
    </div>
  )
}

function RailInboxCard({ item, i, onPlan }: { item: InboxItem; i: number; onPlan: (x: number, y: number) => void }) {
  const title = inboxTitle(item)
  return (
    <div
      className="unscheduled-task"
      data-inbox-id={item.id}
      data-title={title}
      data-duration={inboxMinutes(item)}
      style={{ ['--kf-tilt' as string]: `${RAIL_TILTS[i % RAIL_TILTS.length]}deg`, ...CARD }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <Icon name="inbox" size={15} style={{ flex: 'none', marginTop: 2, color: 'var(--ink-faint)' }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--ink-body)', lineHeight: 1.35 }}><EmojiText text={title} /></div>
      </div>
      <div style={{ ...META, marginTop: 7, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>Inbox</span>
        <PlanButton title={title} onPlan={onPlan} />
      </div>
    </div>
  )
}

/** Phones (< 768px) get the touch calendar; desktop keeps the FullCalendar layout below. */
export function CalendarPage() {
  return useIsMobile() ? <PhoneCalendar /> : <DesktopCalendar />
}

function DesktopCalendar() {
  const openTask = useOpenTask()
  const { data: events = [] } = useCalendarEvents()
  const { data: tasks = [], isPending: tasksPending } = useTasks()
  const { data: settings } = useAppSettings()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const gridRef = useRef<CalendarGridHandle>(null)
  // CALENDAR.md §7 pending / sync-failed block states, straight from the outbox.
  const outboxMarks = useOutboxMarks('calendar_events')
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  // Kai 2026-10-06: a search hit for an event opened this week, wherever the event was.
  // /calendar?event=<id> turns the grid to its day and opens its details (once it's loaded).
  const linked = useLinkedEvent(events)
  if (linked.open) setSelectedEvent(linked.open)
  const linkedStart = linked.event?.starts_at
  useEffect(() => {
    if (linkedStart) gridRef.current?.gotoDate(new Date(linkedStart))
  }, [linkedStart])
  const [contextMenu, setContextMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)
  // The Lists section (folded by default): any smart list / project / area / domain, minus what
  // Overdue and Today already hold. This Week by default — Today has its own section now.
  const [scope, setScope] = useState<RailScope>({ kind: 'smart', id: 'week' })
  const [viewKind, setViewKind] = useState<ViewKind>('week')
  // Effects 21 — the chip created by a rail drop plays settle-in once.
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [rangeInfo, setRangeInfo] = useState<{ title: string; start: Date; end: Date } | null>(null)
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
  const daisy = daisyAsset(new Date().getHours())
  const motionOn = useMotionEnabled()
  const conflicts = useMemo(() => computeConflicts(events), [events])
  const load = useMemo(() => todaysLoad(events), [events, today]) // eslint-disable-line react-hooks/exhaustive-deps
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

  function patchViewOpts(patch: Partial<CalViewOptions>) {
    setViewOpts((v) => {
      const next = { ...v, ...patch }
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
  const visibleEvents = viewOpts.showCompleted ? events : events.filter((e) => !(e.task_id && doneTaskIds.has(e.task_id)))

  const scopeValueOptions =
    scope.kind === 'smart'
      ? SMART_LIST_OPTIONS
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
    const draggable = new Draggable(sidebarRef.current, {
      itemSelector: '.unscheduled-task',
      eventData: (el) => {
        const min = Number(el.dataset.duration) || 30
        const hh = String(Math.floor(min / 60)).padStart(2, '0')
        const mm = String(min % 60).padStart(2, '0')
        return { title: el.dataset.title ?? '', duration: `${hh}:${mm}` }
      },
    })
    return () => draggable.destroy()
  }, [])

  // ── Plan ▾ (a rail card's, an overdue block's Replan, the details panel's): Today · Next free
  // slot · Tomorrow first thing · Pick date…. A time puts it on the calendar (its block moves there —
  // never a second one); a date alone plans the day (calendar/replan has the rule). ──
  const [plan, setPlan] = useState<{ target: PlanTarget; x: number; y: number } | null>(null)
  function planFor(target: PlanTarget): ContextMenuItem[] {
    const now = new Date()
    const dur = target.kind === 'task' ? railMinutes(target.r) : inboxMinutes(target.item)
    const title = target.kind === 'task' ? target.r.task.title : inboxTitle(target.item)
    const next = nextFreeSlot(events, now, dur)
    const first = tomorrowFirst(events, now, dur)
    const at = (s: { starts_at: string; ends_at: string }) => {
      const d = new Date(s.starts_at)
      return cairoDateKey(d) === cairoDateKey(now) ? cairoTimeKey(d) : `${dayHint(cairoDateKey(d), cairoDateKey(now))} ${cairoTimeKey(d)}`
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
      { label: 'Today', icon: <Icon name="today" size={16} />, onClick: () => day(scheduleToday(now)) },
      ...(next ? [{ label: `Next free slot · ${at(next)}`, icon: <Icon name="clock" size={16} />, onClick: () => place(next.starts_at, next.ends_at) }] : []),
      { label: `Tomorrow first thing · ${cairoTimeKey(new Date(first.starts_at))}`, icon: <Icon name="tomorrow" size={16} />, onClick: () => place(first.starts_at, first.ends_at) },
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

  function openExisting(event: CalendarEvent) {
    setSelectedEvent(event)
  }

  function handleEventClick(id: string) {
    setContextMenu(null)
    const event = events.find((e) => e.id === id)
    if (event) openExisting(event)
  }

  // Punch 6 (calendar slice): every destructive calendar mutation undoes through the same api — never a bare toast.
  const unscheduleWithUndo = (event: CalendarEvent) => deleteEventWithUndo(event, 'Unscheduled')
  const deleteWithUndo = (event: CalendarEvent) => deleteEventWithUndo(event, 'Deleted')

  function handleEventContextMenu(id: string, x: number, y: number) {
    setContextMenu(null)
    const event = events.find((e) => e.id === id)
    if (!event) return
    const items: ContextMenuItem[] = []
    if (event.type === 'task') {
      items.push({ label: 'Edit Task', onClick: () => { setContextMenu(null); openExisting(event) } })
      if (isMissed(event)) items.push({ label: 'Replan…', onClick: () => replanEvent(event, x, y) })
      items.push({ label: 'Complete', onClick: () => { setContextMenu(null); const t = tasks.find((t) => t.id === event.task_id); if (t) completeTaskWithUndo(t) } })
      items.push({ label: 'Unschedule', onClick: () => { setContextMenu(null); unscheduleWithUndo(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteWithUndo(event) } })
    } else {
      items.push({ label: 'Edit', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteWithUndo(event) } })
    }
    setContextMenu({ items, x, y })
  }

  /** Punch 33: a scheduled task block dragged back onto the rail returns to Unscheduled.
   * Plain events have no "unscheduled" home — they get the soft-no instead (return false). */
  function handleDragToRail(id: string): boolean {
    const event = events.find((e) => e.id === id)
    if (!event?.task_id) return false
    unscheduleWithUndo(event)
    return true
  }

  /** Punch 34: double-click on a task-linked block goes straight to the task editor. */
  function handleEventDoubleClick(id: string) {
    const event = events.find((e) => e.id === id)
    if (event?.task_id) openTask(event.task_id)
  }

  // Empty-slot click/drag → Editor 2a's quick-create popover, kind defaults to Event.
  // T-4 (Polish F2b): QuickCreate's fields are Cairo wall-clock; slotFields converts the slot so
  // the form shows the clicked time on Cairo's clock and saves that exact instant back.
  function handleGridCreate(info: { start: string; end: string; allDay: boolean; x: number; y: number }) {
    // The grid snaps to 15 min (Kai 2026-10-03), so a plain click selects one quarter; it still
    // makes the half-hour it always did. A drag keeps exactly what was dragged.
    const startMs = new Date(info.start).getTime()
    const end = !info.allDay && new Date(info.end).getTime() - startMs <= 15 * 60000 ? new Date(startMs + 30 * 60000).toISOString() : info.end
    setQuickCreate({
      kind: 'event',
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
    const min = allDay ? 24 * 60 : task ? railMinutes(buckets.overdue.find((r) => r.task.id === task.id) ?? { task, block: null }) : item ? inboxMinutes(item) : 30
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
  const railFolded = railPref ? railPref === 'folded' : buckets.overdue.length === 0 && railYields(shellWidth, railWidth, visibleDayCount(viewKind, dayCount, viewOpts.showWeekends))
  function setRailFolded(folded: boolean) {
    setRailPref(folded ? 'folded' : 'open')
    try {
      localStorage.setItem(RAIL_FOLD_KEY, folded ? '1' : '0')
    } catch {
      /* private mode — the choice lasts this visit */
    }
  }

  function startRailDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return // J-4a: a right-button drag used to resize the rail
    e.preventDefault()
    const startX = e.clientX
    const startW = railWidth
    setRailDragging(true)
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startW + (ev.clientX - startX)))
      setRailWidth(next)
    }
    const onUp = () => {
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

  const pillCircle = { width: 32, height: 32, border: '1px solid var(--line-solid)', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)', cursor: 'pointer', flex: 'none' as const }

  return (
    <>
      <style>{`
        .cal-shell { display: flex; align-items: stretch; height: 100%; min-height: 0; }
        .cal-rail { width: var(--cal-rail-w, 244px); flex: none; border-right: 1px dashed var(--line-solid); display: flex; flex-direction: column; padding: 22px 20px; overflow-y: auto; }
        .cal-railsplit { flex: none; width: 7px; cursor: col-resize; position: relative; }
        .cal-railsplit::after { content: ""; position: absolute; inset: 0 3px; background: transparent; transition: background var(--dur-quick); }
        .cal-railsplit:hover::after, .cal-railsplit[data-dragging]::after { background: var(--acc-lavender); }
        /* Polish D: the folded rail — a strip with the sidebar's own round collapse button
           (AppLayout's .kf-collapse-btn look) and the rail's own mono label, read upward. */
        .cal-rail.is-folded { display: none; }
        .cal-rail-tab { flex: none; width: 34px; border: none; border-right: 1px dashed var(--line-solid); background: none; padding: 18px 0; display: flex; flex-direction: column; align-items: center; gap: 14px; cursor: pointer; font: inherit; color: var(--ink-faint); }
        .cal-rail-knob { flex: none; width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid var(--line-card); background: var(--paper-parchment); box-shadow: var(--shadow-crisp); color: var(--ink-faint); font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .cal-rail-tab-label { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-faint); white-space: nowrap; }
        .cal-rail-tab:hover .cal-rail-tab-label { color: var(--ink-muted); }
        .cal-railsplit .cal-rail-knob { position: absolute; top: 18px; left: -9px; z-index: 2; }
        .cal-rail-cards { display: flex; flex-direction: column; gap: 10px; }
        /* Kai 2026-10-07: Overdue · Today · Inbox · Lists, each folding on its own header. */
        .cal-rail-secs { display: flex; flex-direction: column; gap: 14px; }
        .cal-rail-sec-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 0; margin-bottom: 8px; border: none; background: none; cursor: pointer; font: inherit; font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-muted); text-align: left; }
        .cal-rail-sec-head:hover { color: var(--ink-body); }
        .cal-rail-sec-head:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 4px; }
        .cal-rail-sec-count { margin-left: auto; color: var(--ink-faint); }
        .cal-plan-btn { margin-left: auto; flex: none; cursor: pointer; padding: 2px 7px; border: 1px solid var(--line-solid); border-radius: 999px; color: var(--ink-muted); }
        .cal-plan-btn:hover { color: var(--ink-body); border-color: var(--ink-faint); }
        .cal-plan-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
        /* Motion 5b "drag lift" — the one grammar for every draggable, matching lib/motion's
           dragLift(): pick-up 140ms to scale 1.04 / +1.2deg under a 14/30 shadow, release
           settles back over 320ms with the spring overshoot. The tilt composes via --kf-tilt.
           Motion 4a hover/press rides the same transition. */
        .unscheduled-task {
          cursor: grab;
          box-shadow: var(--shadow-crisp);
          transform: rotate(var(--kf-tilt, 0deg));
          transition: transform 320ms var(--ease-spring), box-shadow 320ms var(--ease-out);
        }
        @media (hover: hover) { .unscheduled-task:hover { box-shadow: var(--shadow-card); } }
        .motion-on .unscheduled-task:active {
          cursor: grabbing;
          opacity: 0.92;
          transform: rotate(var(--kf-tilt, 0deg)) scale(1.04) rotate(1.2deg);
          box-shadow: 0 14px 30px rgba(60, 52, 38, 0.26);
          transition: transform 140ms var(--ease-out), box-shadow 140ms var(--ease-out);
        }
        .cal-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 12px 22px 10px; }
      `}</style>

      <div className="cal-shell" ref={shellRef} style={{ ['--cal-rail-w' as string]: `${railWidth}px` } as React.CSSProperties}>
        {railFolded && (
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
        <aside className={railFolded ? 'cal-rail is-folded' : 'cal-rail'} ref={railRef} aria-label="Planning rail">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>To plan</div>
          </div>
          <div className="cal-rail-extra" style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', margin: '3px 0 12px' }}>drag onto a time to plant it ✿</div>

          <div
            className="cal-rail-extra"
            onClick={openQuickAddTask}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 11px', marginBottom: 12, cursor: 'pointer' }}
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
                  {buckets.overdue.map((r, i) => (
                    <RailTaskCard key={r.task.id} r={r} i={i} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="today" label="Today" count={buckets.today.length} folded={sections.today} onToggle={toggleSection} empty="Nothing left without a time today.">
                  {buckets.today.map((r, i) => (
                    <RailTaskCard key={r.task.id} r={r} i={i} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="inbox" label="Inbox" count={inbox.length} folded={sections.inbox} onToggle={toggleSection} empty="Inbox zero.">
                  {inbox.map((item, i) => (
                    <RailInboxCard key={item.id} item={item} i={i} onPlan={(x, y) => setPlan({ target: { kind: 'inbox', item }, x, y })} />
                  ))}
                </RailSectionBox>
                <RailSectionBox name="lists" label="Lists" count={listTasks.length} folded={sections.lists} onToggle={toggleSection} empty="Nothing else here to block.">
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
                  {listTasks.map((task, i) => (
                    <RailTaskCard key={task.id} r={{ task, block: null, late: 0 }} i={i} domains={domains} projects={projects} areas={areas} onPlan={(x, y) => setPlan({ target: { kind: 'task', r: { task, block: null, late: 0 } }, x, y })} />
                  ))}
                </RailSectionBox>
              </>
            )}
          </div>

          <div className="cal-rail-extra" style={{ flex: 1 }} />
          <div className="cal-rail-extra" style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
            <img src={`/ds/assets/daisy/${daisy.src}.png`} alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
              {load.blocked} blocked<br />{load.freeHours}h free today
            </div>
          </div>
        </aside>

        {/* R4-16: drag to rebalance rail vs. grid; double-click restores the default. */}
        {!railFolded && (
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
          </div>
        )}

        <div className="cal-main">
          <div className="cal-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src={`/ds/assets/daisy/${daisy.src}.png`} alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  {`Week ${weekNumber(rangeInfo?.start ?? new Date())} · ${daisy.note}`}
                </div>
                <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                  {rangeInfo ? rangeLabel(rangeInfo.start, rangeInfo.end, viewKind) : ''}
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Punch 32 [K-26]: the ⚟ view-options trigger replaces the segmented control +
                  N-day cycler — view switching now lives in the popover's 1–6/W/M row. */}
              <span
                role="button"
                aria-haspopup="dialog"
                aria-expanded={viewOptsOpen}
                // Stop the popover's document-level outside-mousedown from firing first —
                // otherwise a trigger click while open closes-then-reopens (toggle never closes).
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setViewOptsAnchor({ x: r.right, y: r.bottom })
                  setViewOptsOpen((v) => !v)
                }}
                style={{
                  padding: '0 14px',
                  height: 32,
                  border: '1px solid var(--line-solid)',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-meta)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-body)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {viewKind === 'day' ? 'Day' : viewKind === 'ndays' ? `${dayCount} days` : viewKind === 'week' ? 'Week' : 'Month'}
                {/* Kai 2026-10-03: the ⚟ glyph read as "≤" — the kit's dropdown chevron, as the phone's title uses. */}
                <Icon name="chevdown" size={14} style={{ color: 'var(--ink-muted)' }} />
              </span>
              <span onClick={() => gridRef.current?.prev()} style={pillCircle}>‹</span>
              <span onClick={() => gridRef.current?.today()} style={{ padding: '0 14px', height: 32, border: '1px solid var(--line-solid)', borderRadius: 999, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, color: 'var(--ink-body)', cursor: 'pointer' }}>Today</span>
              <span onClick={() => gridRef.current?.next()} style={pillCircle}>›</span>
            </div>
          </div>

          <div className={['cal-grid-card', motionOn && 'cal-motion-on'].filter(Boolean).join(' ')} style={{ flex: 1, background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)', borderRadius: 4, boxShadow: 'var(--shadow-panel)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Kai 2026-07-21: "why cant I scroll horizontally in the week view" — the grid
                keeps ≥170px per day column (CalendarGrid sets its own min-width) and scrolls
                sideways here instead of crushing the last day (today) into a sliver. */}
            <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            <CalendarGrid
              ref={gridRef}
              initialView={VIEW_MAP[viewKind]}
              hideToolbar
              onRangeChange={setRangeInfo}
              events={visibleEvents.map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, allDay: e.all_day, type: e.type ?? 'event', color: e.color, linked: Boolean(e.task_id), taskId: e.task_id, taskDone: e.task_id ? doneTaskIds.has(e.task_id) : false }))}
              onCompleteTask={(taskId, done) => {
                const t = tasks.find((x) => x.id === taskId)
                if (!t) return
                if (done) uncompleteTask(t)
                else completeTaskWithUndo(t)
              }}
              onCreate={handleGridCreate}
              onMove={(id, start, end, allDay) => {
                const event = events.find((e) => e.id === id)
                if (!event) return
                const prior = { ...event }
                moveOrResizeEvent(event, start, end, allDay)
                toastUndo(`Moved · ${event.title}`, () => moveOrResizeEvent(prior, prior.starts_at, prior.ends_at, prior.all_day))
              }}
              onResize={(id, start, end) => {
                const event = events.find((e) => e.id === id)
                if (!event) return
                const prior = { ...event }
                resizeEvent(event, start, end)
                toastUndo(`Resized · ${event.title}`, () => resizeEvent(prior, prior.starts_at, prior.ends_at))
              }}
              onEventClick={handleEventClick}
              onEventDoubleClick={handleEventDoubleClick}
              onExternalDrop={handleExternalDrop}
              onReplan={(id, x, y) => {
                const event = events.find((e) => e.id === id)
                if (event) replanEvent(event, x, y)
              }}
              railRef={railRef}
              onDragToRail={handleDragToRail}
              hour24={viewOpts.hour24}
              firstDay={viewOpts.weekStartsMon ? 1 : 0}
              hiddenDays={viewOpts.showWeekends ? undefined : WEEKEND_DAYS}
              density={viewOpts.density}
              justDroppedId={justDroppedId}
              dayCount={dayCount}
              onEventContextMenu={handleEventContextMenu}
              onGridContextMenu={handleGridContextMenu}
              conflictedIds={Array.from(conflicts.keys())}
              pendingIds={[...outboxMarks.pending]}
              failedIds={[...outboxMarks.failed]}
            />
            </div>
          </div>
        </div>
      </div>

      {viewOptsExit.mounted && (
        <ViewOptionsPopover
          anchor={viewOptsAnchor}
          closing={viewOptsExit.closing}
          onClose={() => setViewOptsOpen(false)}
          activeView={activeViewCell}
          onPickView={pickView}
          value={viewOpts}
          onChange={patchViewOpts}
        />
      )}
      {selectedEvent && (
        <EventDetailsPanel
          event={selectedEvent}
          conflicts={conflicts.get(selectedEvent.id) ?? []}
          onClose={() => setSelectedEvent(null)}
          onReplan={isMissed(selectedEvent) ? (x, y) => { replanEvent(selectedEvent, x, y); setSelectedEvent(null) } : undefined}
        />
      )}
      {plan && <ContextMenu items={planFor(plan.target)} position={{ x: plan.x, y: plan.y }} onClose={() => setPlan(null)} />}
      {quickCreate && (
        <QuickCreate
          initialKind={quickCreate.kind}
          slot={quickCreate.slot}
          anchor={quickCreate.anchor}
          onClose={() => {
            setQuickCreate(null)
            gridRef.current?.unselect()
          }}
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
