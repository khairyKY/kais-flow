import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/kit'
import { addDays, daysWithItems } from '../../components/pickerMath'
import { EmptyState, OfflineChip } from '../../components/States'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { useOutboxMarks } from '../../lib/outbox'
import { useOnline } from '../../lib/useOnline'
import type { CalendarEvent } from '../../lib/types'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { completeTaskWithUndo, uncompleteTask, useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { formatDuration } from '../tasks/taskDisplay'
import { useMinuteNow } from '../today/useMinuteNow'
import { goalIdOf } from '../today/top3Order'
import { legacyGoalId } from '../today/goalStore'
import { cachedStarEvents } from '../today/api'
import { blockHue, KIND_HUE } from './blockHue'
import { moveEventWithUndo, outOfSlotWithUndo, putInSlotWithUndo, scheduleTaskWithUndo, useCalendarEvents, useCalendarRows } from './api'
import { findBlock } from './series'
import { heldDrop, slotFill, slotTasks } from './slots'
import { cairoToIso, timeRange } from './eventTime'
import { blockLastDay, railBuckets, railMinutes, scheduledToday } from './replan'
import { NowCard } from './NowCard'
import { fileToCalendar, inboxMinutes, inboxTitle, usePendingInboxItems } from '../inbox/api'
import { Segmented } from '../rituals/RitualChrome'
import { addMonths, allDayOn, dayBlocks, eventSpan, monthTitle, rangeText, spanIso, tapStart, viewStep, viewTitle, visibleDays, weekdayRange, weekPage, type DragMode, type PhoneView, type Span } from './phoneGridMath'
import { PhoneMonth } from './PhoneMonth'
import { readViewOptions } from './ViewOptionsPopover'
import { SMART_LISTS } from './railDrop'
import { filterByScope, type RailScope, type RailScopeKind } from '../tasks/grouping'
import { useAreas } from '../areas/api'
import { placeName } from '../tasks/move'
import { PhoneGrid, type BlockLook, type PhoneGridHandle } from './PhoneGrid'
import { BlockSheet, QuickCreateSheet, ScheduleSheet } from './PhoneSheets'
import './phoneCalendar.css'
import { useLinkedEvent } from './linkedEvent'
import { useCalendarDefaultView } from '../../lib/settings'

const MorningRitual = lazy(() => import('../rituals/MorningRitual').then((m) => ({ default: m.MorningRitual })))

// ── Calendar on a phone (< 768px) — design-export/Calendar Phone.dc.html 7a–7n + SCREENS-2026-09-28-
// sheets §Calendar (phone). Header (title = view switch · Today), the MK Week Strip, the unscheduled
// strip, then our own touch grid (PhoneGrid). Desktop keeps CalendarPage's FullCalendar layout. ──

type Sheet =
  | { k: 'view' }
  | { k: 'create'; day: string; start: number }
  | { k: 'block'; id: string; start: string }
  | { k: 'more'; ids: string[] }
  /** 7g: a task from the rail strip — or, `replan`, an overdue block tapped on the grid. */
  | { k: 'schedule'; id: string; replan?: boolean }
  | { k: 'file'; id: string }
  | { k: 'plan' }
  /** The Lists segment's list picker: the smart lists and the project / area / domain kinds, then one of those. */
  | { k: 'scope'; kind?: Exclude<RailScopeKind, 'smart'> }

type Seg = 'overdue' | 'today' | 'scheduled' | 'inbox' | 'lists'
const SEG_LABEL: Record<Seg, string> = { overdue: 'Overdue', today: 'Today', scheduled: 'Scheduled', inbox: 'Inbox', lists: 'Lists' }

// How far under the grid's top a block or slot lands when its sheet opens (7c, 7d). The planning
// strip's segment row (Kai 2026-10-07) moved the grid down 48px, so it's 32, not 80: the block sits
// where it did, clear above a medium sheet.
const SHEET_LEAD = 32

const VIEWS: { v: PhoneView; label: string }[] = [
  { v: 'day', label: 'Day' },
  { v: '3day', label: '3 days' },
  { v: 'week', label: 'Week' },
  // Phone parity: the desktop's Month.
  { v: 'month', label: 'Month' },
]

export function PhoneCalendar() {
  // Repeating events (migration 0061): `events` = the year around today (the strip's planning, the
  // Schedule sheet's free slots); `gridEvents` = what the week strip and the grid show (below).
  const { data: events = [], isPending: eventsPending } = useCalendarEvents()
  const { data: rows = [] } = useCalendarRows()
  const { data: tasks = [], isPending: tasksPending } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const online = useOnline()
  const marks = useOutboxMarks('calendar_events')
  const now = useMinuteNow()
  const today = cairoDateKey(now)
  const [view, setView] = useState<PhoneView>('day')
  // Settings → the calendar's default view (synced): applied once when settings load, then the
  // title's Day / 3 days / Week switch is the reader's own — same pattern as the desktop calendar.
  const defaultView = useCalendarDefaultView('day')
  const [openedOnDefault, setOpenedOnDefault] = useState(false)
  if (defaultView && !openedOnDefault) {
    setOpenedOnDefault(true)
    if (defaultView !== view) setView(defaultView)
  }
  // /calendar?date=YYYY-MM-DD (a day tapped on the week widgets) opens on that day.
  const [anchor, setAnchor] = useState(() => new URLSearchParams(location.search).get('date')?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? today)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const gridRef = useRef<PhoneGridHandle>(null)
  // /calendar?event=<id> (a search hit, Kai 2026-10-06): its day, its sheet, the block in view.
  const linked = useLinkedEvent(rows)
  if (linked.open) {
    setAnchor(cairoDateKey(new Date(linked.open.starts_at)))
    setSheet({ k: 'block', id: linked.open.id, start: linked.open.starts_at })
  }
  const linkedMin = linked.event && !linked.event.all_day ? eventSpan(linked.event).start : null
  useEffect(() => {
    if (linkedMin != null) gridRef.current?.scrollToMinute(linkedMin, SHEET_LEAD)
  }, [linkedMin])
  const openTask = useOpenTask()

  // A page left open past midnight: if it was showing today, it follows the new day.
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    setSeenToday(today)
    if (anchor === seenToday) setAnchor(today)
  }

  const mondayFirst = readViewOptions().weekStartsMon
  const days = visibleDays(view, anchor, today, mondayFirst)
  const strip = weekPage(anchor, today)
  // The days on screen and the strip's week, a day either side (a block over midnight).
  const shown = [...strip, ...days].sort()
  const gridFrom = cairoToIso(addDays(shown[0], -1), '00:00')
  const gridTo = cairoToIso(addDays(shown[shown.length - 1], 2), '00:00')
  const gridRange = useMemo(() => ({ start: new Date(gridFrom), end: new Date(gridTo) }), [gridFrom, gridTo])
  const { data: gridEvents = [] } = useCalendarEvents(gridRange)
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  // Kai 2026-10-07: the strip is the desktop rail's Overdue · Today · Inbox, one segment at a time
  // (the first with anything in it, until one is picked); a chip opens the 7g sheet.
  const { data: inbox = [], isPending: inboxPending } = usePendingInboxItems()
  const buckets = useMemo(() => railBuckets(tasks, events, now), [tasks, events, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // Phone parity: the rail's Lists (any smart list, project, area or domain), minus what Overdue and
  // Today already hold — the desktop rail's section, as a fourth segment.
  const [scope, setScope] = useState<RailScope>({ kind: 'smart', id: 'week' })
  const inRail = new Set([...buckets.overdue, ...buckets.today].map((r) => r.task.id))
  const listTasks = filterByScope(tasks, scope).filter((t) => !t.scheduled_start && !inRail.has(t.id))
  const scopeName =
    scope.kind === 'smart'
      ? SMART_LISTS.find((l) => l.value === scope.id)?.label
      : placeName({ project_id: scope.kind === 'project' ? scope.id : null, area_id: scope.kind === 'area' ? scope.id : null, domain_id: scope.kind === 'domain' ? scope.id : null }, projects, areas, domains)
  // cal-wave item 18 (the desktop rail's rule): Scheduled = today's tasks already on the calendar; a segment
  // with nothing in it steps aside (Lists stays on a scope the person picked).
  const scheduled = useMemo(() => scheduledToday(tasks, events, now), [tasks, events, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts: Record<Seg, number> = { overdue: buckets.overdue.length, today: buckets.today.length, scheduled: scheduled.length, inbox: inbox.length, lists: listTasks.length }
  const keepLists = !(scope.kind === 'smart' && scope.id === 'week')
  const segs = (['overdue', 'today', 'scheduled', 'inbox', 'lists'] as const).filter((k) => counts[k] > 0 || (k === 'lists' && keepLists))
  const [segPick, setSegPick] = useState<Seg | null>(null)
  const seg: Seg | undefined = segPick && segs.includes(segPick as never) ? segPick : segs[0]
  const marked = useMemo(() => daysWithItems(tasks, gridEvents), [tasks, gridEvents])

  // Goal A (Kai 2026-10-23): the first of today's Top 3 (today/top3Order) — its block on today wears the gold edge.
  const goalTaskId = useMemo(() => goalIdOf(tasks, legacyGoalId(), cachedStarEvents()), [tasks, today]) // eslint-disable-line react-hooks/exhaustive-deps
  // CALENDAR.md §3, first match wins: a colour set on the block · a task's project hue (its own, else
  // its domain's) · a meeting (a plain event) blossom · any other task or block lavender. S10: worked out
  // once per block while the data holds (a swipe drew every block of three panes on every move).
  const look = useMemo(() => {
    const cache = new WeakMap<CalendarEvent, BlockLook>()
    return (e: CalendarEvent): BlockLook => {
      let v = cache.get(e)
      if (!v) {
        v = lookOf(e)
        cache.set(e, v)
      }
      return v
    }
  }, [tasks, taskById, projects, domains, today, goalTaskId]) // eslint-disable-line react-hooks/exhaustive-deps
  function lookOf(e: CalendarEvent): BlockLook {
    const task = e.task_id ? taskById.get(e.task_id) : undefined
    const project = task?.project_id ? projects.find((p) => p.id === task.project_id) : undefined
    const hue = e.color ?? project?.color ?? (project && domains.find((d) => d.id === project.domain_id)?.color) ?? null
    // cal-looks ("Now" as drawn, as the desktop's): the accent at 24% for the fill, 45% for the edge, its text tone
    // for the time and the check — a swatch is its token (./blockHue), so Night Garden redraws it.
    const hueOf = hue ? blockHue(hue) : e.type === 'event' && !e.task_id ? KIND_HUE.event : KIND_HUE.task
    const tone = { fill: `color-mix(in srgb, ${hueOf.c} var(--blk-fill), transparent)`, edge: `color-mix(in srgb, ${hueOf.c} 45%, transparent)`, ink: hueOf.ink }
    const done = task?.status === 'done'
    // Time Slots (0073): a Time block draws the tasks this occurrence holds, as the desktop's does.
    const held = e.type === 'time_block' ? slotTasks(e, tasks) : []
    const slot = held.length
      ? {
          fill: slotFill(e, held),
          held: held.map((t) => {
            const isDone = t.status === 'done'
            return { id: t.id, title: t.title, done: isDone, minutes: t.duration_min || 30, toggle: () => (isDone ? uncompleteTask(t) : completeTaskWithUndo(t)), open: () => openTask(t.id) }
          }),
        }
      : undefined
    // Subtasks C: a subtask's own block says whose it is.
    const parent = task?.parent_task_id ? taskById.get(task.parent_task_id)?.title : undefined
    const goal = !!task && task.id === goalTaskId && !e.all_day && cairoDateKey(new Date(e.starts_at)) === today
    return { ...tone, check: task && { done, repeat: task.recurrence_rule, toggle: () => (done ? uncompleteTask(task) : completeTaskWithUndo(task)) }, note: overdueBlock(e) ? 'Overdue · Replan' : undefined, slot, parent, goal }
  }

  /** A task block that ended before today, not done — it reads "Overdue · Replan" and a tap replans it. */
  function overdueBlock(e: CalendarEvent): boolean {
    const task = e.task_id ? taskById.get(e.task_id) : undefined
    return task?.status === 'todo' && blockLastDay(e) < today
  }

  /** The 7g sheet placed it: the block (moved or new) is where the grid shows, in view above. */
  function placed(startsAt: string) {
    const day = cairoDateKey(new Date(startsAt))
    if (!days.includes(day)) setAnchor(day)
    gridRef.current?.scrollToMinute(eventSpan({ starts_at: startsAt, ends_at: startsAt }).start, SHEET_LEAD)
  }

  /** A drop, a resize or the event sheet's Time: one write, one toast with Undo (7m). */
  function commit(e: CalendarEvent, from: Span, to: Span, mode: DragMode) {
    // Moved from its sheet (Time): keep it in view above the sheet, at its new time.
    if (sheet?.k === 'block' && sheet.id === e.id) gridRef.current?.scrollToMinute(to.start, SHEET_LEAD)
    moveEventWithUndo(e, from, to, mode)
  }

  /** slot-outline: a held task's row dragged out of its slot (the desktop's rules, slots.heldDrop): off
   * the grid (the strip) → out of the slot; another Time block → into it; empty time → its own block. */
  function dropHeld(taskId: string, at: { day: string; start: number } | null) {
    const task = taskById.get(taskId)
    if (!task) return
    const drop = heldDrop(task, at && spanIso({ ...at, end: at.start }).starts_at, gridEvents)
    if (drop.kind === 'out') outOfSlotWithUndo(task)
    else if (drop.kind === 'into') putInSlotWithUndo(task, drop.slot)
    else if (drop.kind === 'block') scheduleTaskWithUndo(task, drop.starts_at, drop.ends_at)
  }

  /** A task opens as itself — the Task sheet over the calendar (Kai 2026-10-03, one tap less); a plain
   * event (or a block whose task isn't here) opens the event sheet (7d). The block stays in view above. */
  function tapBlock(e: CalendarEvent) {
    if (!e.all_day) gridRef.current?.scrollToMinute(eventSpan(e).start, SHEET_LEAD)
    if (e.task_id && overdueBlock(e)) setSheet({ k: 'schedule', id: e.task_id, replan: true })
    else if (e.task_id && taskById.has(e.task_id)) openTask(e.task_id)
    else setSheet({ k: 'block', id: e.id, start: e.starts_at })
  }

  const slotRect = (day: string, start: number, end: number) => gridRef.current?.rectOf(day, start, end) ?? null

  function goToday() {
    setAnchor(today)
    gridRef.current?.centerNow()
  }

  // findBlock: an edit from the sheet can re-anchor a repeat under it (series.ts).
  const block = sheet?.k === 'block' ? findBlock(gridEvents, sheet.id, sheet.start) : undefined
  if (sheet?.k === 'block' && !block) setSheet(null) // its block went (another device): don't reopen if it comes back
  const scheduling = sheet?.k === 'schedule' ? taskById.get(sheet.id) : undefined
  const filing = sheet?.k === 'file' ? inbox.find((i) => i.id === sheet.id) : undefined
  const emptyDay = view === 'day' && !eventsPending && dayBlocks(gridEvents, anchor).length === 0 && allDayOn(gridEvents, days).length === 0

  return (
    <div className="pc cal-shell">
      <header className="pc-head">
        <h1 className="pc-h1">
          <button type="button" className="pc-title" aria-haspopup="dialog" aria-expanded={sheet?.k === 'view'} onClick={() => setSheet({ k: 'view' })}>
            {view === 'month' ? monthTitle(anchor) : viewTitle(days)}
            <Icon name="chevdown" size={20} className="pc-chev" />
          </button>
        </h1>
        <Button variant="ghost" onClick={goToday}>Today</Button>
      </header>
      {!online && (
        <div className="pc-offline">
          <OfflineChip />
        </div>
      )}

      {/* MK Week Strip: the rolling week holding the shown day; 3 days washes its range. (Month is its own grid.) */}
      {view !== 'month' && (
      <div className="pc-week" role="group" aria-label="Week">
        {strip.map((d) => {
          const i = days.indexOf(d)
          const range = view === '3day' && i >= 0 ? (i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'mid') : undefined
          return (
            <button
              key={d}
              type="button"
              className="pc-day"
              data-today={d === today || undefined}
              data-range={range}
              aria-current={d === anchor ? 'date' : undefined}
              aria-label={new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}
              onClick={() => setAnchor(d)}
            >
              <span className="pc-day-l">{new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'narrow' })}</span>
              <span className="pc-day-n">{Number(d.slice(8))}</span>
              <span className="pc-day-dot" data-on={marked.has(d) || undefined} />
            </button>
          )
        })}
      </div>
      )}

      {!tasksPending && !inboxPending && !seg && <div className="pc-none">Nothing to plan</div>}
      {(tasksPending || inboxPending || seg) && (
        <>
          <div className="pc-segs">
            <Segmented
              label="To plan"
              options={segs.map((k) => ({ value: k, label: `${SEG_LABEL[k]} ${counts[k]}` }))}
              value={tasksPending || !seg ? null : seg}
              onChange={setSegPick}
            />
          </div>
          <div className="pc-uns" data-seg={seg}>
            {tasksPending
              ? [0, 1].map((i) => <span key={i} className="pc-chip is-skel" />)
              : seg === 'lists'
                ? [
                    <button key="scope" type="button" className="pc-chip" aria-haspopup="dialog" onClick={() => setSheet({ k: 'scope' })}>
                      <span className="pc-chip-t">{scopeName ?? 'Lists'}</span>
                      <Icon name="chevdown" size={16} />
                    </button>,
                    ...listTasks.map((t) => (
                      <button key={t.id} type="button" className="pc-chip" aria-expanded={scheduling?.id === t.id} onClick={() => setSheet({ k: 'schedule', id: t.id })}>
                        <span className="pc-chip-t">{t.title}</span>
                        {t.duration_min != null && <span className="pc-chip-d">{formatDuration(t.duration_min)}</span>}
                      </button>
                    )),
                  ]
              : seg === 'scheduled'
                ? scheduled.map((r) => (
                    <button key={r.task.id} type="button" className="pc-chip" onClick={() => r.block && tapBlock(r.block)}>
                      <span className="pc-chip-t">{r.task.title}</span>
                      {r.block && <span className="pc-chip-d">{timeRange(new Date(r.block.starts_at), new Date(r.block.ends_at))}</span>}
                    </button>
                  ))
              : seg === 'inbox'
                ? inbox.map((item) => (
                    <button key={item.id} type="button" className="pc-chip" aria-expanded={filing?.id === item.id} onClick={() => setSheet({ k: 'file', id: item.id })}>
                      <span className="pc-chip-t">{inboxTitle(item)}</span>
                    </button>
                  ))
                : !seg ? null : buckets[seg].map((r) => (
                    <button key={r.task.id} type="button" className="pc-chip" aria-expanded={scheduling?.id === r.task.id} onClick={() => setSheet({ k: 'schedule', id: r.task.id })}>
                      <span className="pc-chip-t">{r.task.title}</span>
                      {r.late > 0 ? <span className="pc-chip-d is-late">{r.late}d</span> : r.task.duration_min != null && <span className="pc-chip-d">{formatDuration(r.task.duration_min)}</span>}
                    </button>
                  ))}
            {!tasksPending && seg && counts[seg] === 0 && <span className="pc-uns-label">{seg === 'overdue' ? 'Nothing overdue' : seg === 'today' ? 'Nothing left without a time' : seg === 'lists' ? 'Nothing else to block' : 'Inbox zero'}</span>}
          </div>
        </>
      )}

      {view === 'month' ? (
        <PhoneMonth
          days={days}
          month={anchor}
          today={today}
          events={gridEvents}
          dotOf={(e) => look(e).ink}
          mondayFirst={mondayFirst}
          onPick={(d) => {
            setAnchor(d)
            setView('day')
          }}
          onPage={(dir) => setAnchor((a) => addMonths(a, dir))}
        />
      ) : (
      <PhoneGrid
        ref={gridRef}
        days={days}
        step={viewStep(view)}
        today={today}
        now={now}
        events={gridEvents}
        look={look}
        pending={marks.pending}
        loading={eventsPending}
        onPage={(dir) => setAnchor((a) => addDays(a, dir * viewStep(view)))}
        onTapSlot={(day, minute) => {
          const start = tapStart(minute)
          // The slot stays in view above the sheet and the keyboard (7c).
          gridRef.current?.scrollToMinute(start, SHEET_LEAD)
          setSheet({ k: 'create', day, start })
        }}
        onTapBlock={tapBlock}
        onTapMore={(hidden) => setSheet({ k: 'more', ids: hidden.map((e) => e.id) })}
        onCommit={commit}
        onDropHeld={dropHeld}
        overlay={
          emptyDay && (
            <div className="pc-empty">
              <EmptyState image="/ds/assets/daisy/future.png" line="A clear day — tap any time to plan" action={{ label: 'Plan my day', onClick: () => setSheet({ k: 'plan' }) }} />
            </div>
          )
        }
      />
      )}

      {/* cal-wave item 19: the Now card, a one-line strip over the grid's foot (tap it to open the card). */}
      {readViewOptions().nowCard && view !== 'month' && (
        <div className="pc-now">
          <NowCard
            events={events}
            tasks={tasks}
            variant="phone"
            onOpen={(e) => {
              setAnchor(cairoDateKey(new Date(e.starts_at)))
              tapBlock(e)
            }}
          />
        </div>
      )}

      {sheet?.k === 'view' && (
        <ActionSheet
          title="View"
          meta="Tap the date title"
          onClose={() => setSheet(null)}
          items={VIEWS.map(({ v, label }) => ({
            label,
            icon: <Icon name="calendar" />,
            hint: v === view ? undefined : v === '3day' ? weekdayRange(visibleDays('3day', anchor, today)) : v === 'week' ? viewTitle(weekPage(anchor, today)) : v === 'month' ? monthTitle(anchor) : undefined,
            selected: v === view,
            onSelect: () => setView(v),
          }))}
        />
      )}
      {sheet?.k === 'create' && (
        <QuickCreateSheet day={sheet.day} start={sheet.start} slotRect={slotRect} onClose={() => setSheet(null)} />
      )}
      {block && (
        <BlockSheet event={block} look={look(block)} slotRect={slotRect} pending={marks.pending.has(block.id)} onMove={commit} onRebind={(ref) => setSheet({ k: 'block', id: ref.id, start: ref.start })} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'more' && (
        <ActionSheet
          title={`${sheet.ids.length} more`}
          meta="At the same time"
          onClose={() => setSheet(null)}
          items={gridEvents
            .filter((e) => sheet.ids.includes(e.id))
            .map((e) => {
              const s = eventSpan(e)
              return { label: e.title, icon: <Icon name={e.task_id ? 'tasks' : 'calendar'} />, hint: rangeText(s.start, s.end), onSelect: () => tapBlock(e) }
            })}
        />
      )}
      {scheduling && sheet?.k === 'schedule' && (
        <ScheduleSheet
          title={scheduling.title}
          duration={railMinutes({ task: scheduling, block: buckets.overdue.find((r) => r.task.id === scheduling.id)?.block ?? null })}
          heading={sheet.replan ? 'Replan' : 'Schedule'}
          events={events}
          onPlace={(startsAt, endsAt) => {
            scheduleTaskWithUndo(scheduling, startsAt, endsAt)
            placed(startsAt)
          }}
          // Phone parity: a chip is completed or opened from here too, not only scheduled.
          onOpen={() => openTask(scheduling.id)}
          onComplete={() => completeTaskWithUndo(scheduling)}
          onClose={() => setSheet(null)}
        />
      )}
      {filing && (
        <ScheduleSheet
          title={inboxTitle(filing)}
          duration={inboxMinutes(filing)}
          events={events}
          onPlace={(startsAt, endsAt) => {
            fileToCalendar(filing, startsAt, endsAt)
            placed(startsAt)
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.k === 'scope' && !sheet.kind && (
        <ActionSheet
          title="Lists"
          meta="What the strip lists"
          onClose={() => setSheet(null)}
          items={[
            ...SMART_LISTS.map((l) => ({ label: l.label, icon: <Icon name="tasks" />, selected: scope.kind === 'smart' && scope.id === l.value, onSelect: () => setScope({ kind: 'smart', id: l.value }) })),
            ...(['project', 'area', 'domain'] as const).map((kind) => ({
              label: kind === 'project' ? 'Project…' : kind === 'area' ? 'Area…' : 'Domain…',
              icon: <Icon name={kind === 'project' ? 'project' : 'projects'} />,
              chevron: true,
              // On the next frame: this sheet clears the sheet state as it closes.
              onSelect: () => window.setTimeout(() => setSheet({ k: 'scope', kind }), 0),
            })),
          ]}
        />
      )}
      {sheet?.k === 'scope' && sheet.kind && (
        <ActionSheet
          title={sheet.kind === 'project' ? 'Project' : sheet.kind === 'area' ? 'Area' : 'Domain'}
          meta="List its tasks"
          onClose={() => setSheet(null)}
          items={(sheet.kind === 'project' ? projects : sheet.kind === 'area' ? areas : domains).map((x) => ({
            label: x.name,
            selected: scope.kind === sheet.kind && scope.id === x.id,
            onSelect: () => setScope({ kind: sheet.kind!, id: x.id }),
          }))}
        />
      )}
      {sheet?.k === 'plan' && (
        <Suspense fallback={null}>
          <MorningRitual onClose={() => setSheet(null)} />
        </Suspense>
      )}
    </div>
  )
}
