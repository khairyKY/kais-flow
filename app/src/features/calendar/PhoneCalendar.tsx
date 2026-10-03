import { lazy, Suspense, useMemo, useRef, useState } from 'react'
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
import { filterByScope } from '../tasks/grouping'
import { useOpenTask } from '../tasks/openTask'
import { formatDuration } from '../tasks/taskDisplay'
import { useMinuteNow } from '../today/useMinuteNow'
import { moveEventWithUndo, useCalendarEvents } from './api'
import { allDayOn, dayBlocks, eventSpan, rangeText, tapStart, viewStep, viewTitle, visibleDays, weekdayRange, weekPage, type DragMode, type PhoneView, type Span } from './phoneGridMath'
import { PhoneGrid, type BlockLook, type PhoneGridHandle } from './PhoneGrid'
import { BlockSheet, QuickCreateSheet, ScheduleSheet } from './PhoneSheets'
import './phoneCalendar.css'
import { useCalendarDefaultView } from '../../lib/settings'

const MorningRitual = lazy(() => import('../rituals/MorningRitual').then((m) => ({ default: m.MorningRitual })))

// ── Calendar on a phone (< 768px) — design-export/Calendar Phone.dc.html 7a–7n + SCREENS-2026-09-28-
// sheets §Calendar (phone). Header (title = view switch · Today), the MK Week Strip, the unscheduled
// strip, then our own touch grid (PhoneGrid). Desktop keeps CalendarPage's FullCalendar layout. ──

type Sheet =
  | { k: 'view' }
  | { k: 'create'; day: string; start: number }
  | { k: 'block'; id: string }
  | { k: 'more'; ids: string[] }
  | { k: 'schedule'; id: string }
  | { k: 'plan' }

const VIEWS: { v: PhoneView; label: string }[] = [
  { v: 'day', label: 'Day' },
  { v: '3day', label: '3 days' },
  { v: 'week', label: 'Week' },
]

export function PhoneCalendar() {
  const { data: events = [], isPending: eventsPending } = useCalendarEvents()
  const { data: tasks = [], isPending: tasksPending } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
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
  const [anchor, setAnchor] = useState(today)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const gridRef = useRef<PhoneGridHandle>(null)
  const openTask = useOpenTask()

  // A page left open past midnight: if it was showing today, it follows the new day.
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    setSeenToday(today)
    if (anchor === seenToday) setAnchor(today)
  }

  const days = visibleDays(view, anchor, today)
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const unscheduled = useMemo(() => filterByScope(tasks, { kind: 'smart', id: 'today' }, now).filter((t) => !t.scheduled_start), [tasks, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const marked = useMemo(() => daysWithItems(tasks, events), [tasks, events])

  // CALENDAR.md §3, first match wins: a colour set on the block · a task's project hue (its own, else
  // its domain's) · a meeting (a plain event) blossom · any other task or block lavender.
  function look(e: CalendarEvent): BlockLook {
    const task = e.task_id ? taskById.get(e.task_id) : undefined
    const project = task?.project_id ? projects.find((p) => p.id === task.project_id) : undefined
    const hue = e.color ?? project?.color ?? (project && domains.find((d) => d.id === project.domain_id)?.color) ?? null
    const tone = hue
      ? { fill: `color-mix(in srgb, ${hue} 24%, transparent)`, ink: `color-mix(in srgb, ${hue} 55%, var(--ink-body))` }
      : e.type === 'event' && !e.task_id
        ? { fill: 'var(--block-blossom)', ink: 'var(--acc-blossom-text)' }
        : { fill: 'var(--block-lavender)', ink: 'var(--acc-lavender-text)' }
    const done = task?.status === 'done'
    return { ...tone, check: task && { done, toggle: () => (done ? uncompleteTask(task) : completeTaskWithUndo(task)) } }
  }

  /** A drop, a resize or the event sheet's Time: one write, one toast with Undo (7m). */
  function commit(e: CalendarEvent, from: Span, to: Span, mode: DragMode) {
    // Moved from its sheet (Time): keep it in view above the sheet, at its new time.
    if (sheet?.k === 'block' && sheet.id === e.id) gridRef.current?.scrollToMinute(to.start, 80)
    moveEventWithUndo(e, from, to, mode)
  }

  /** A task opens as itself — the Task sheet over the calendar (Kai 2026-10-03, one tap less); a plain
   * event (or a block whose task isn't here) opens the event sheet (7d). The block stays in view above. */
  function tapBlock(e: CalendarEvent) {
    if (!e.all_day) gridRef.current?.scrollToMinute(eventSpan(e).start, 80)
    if (e.task_id && taskById.has(e.task_id)) openTask(e.task_id)
    else setSheet({ k: 'block', id: e.id })
  }

  const slotRect = (day: string, start: number, end: number) => gridRef.current?.rectOf(day, start, end) ?? null

  function goToday() {
    setAnchor(today)
    gridRef.current?.centerNow()
  }

  const block = sheet?.k === 'block' ? events.find((e) => e.id === sheet.id) : undefined
  if (sheet?.k === 'block' && !block) setSheet(null) // its block went (another device): don't reopen if it comes back
  const scheduling = sheet?.k === 'schedule' ? taskById.get(sheet.id) : undefined
  const emptyDay = view === 'day' && !eventsPending && dayBlocks(events, anchor).length === 0 && allDayOn(events, days).length === 0
  const strip = weekPage(anchor, today)

  return (
    <div className="pc cal-shell">
      <header className="pc-head">
        <h1 className="pc-h1">
          <button type="button" className="pc-title" aria-haspopup="dialog" aria-expanded={sheet?.k === 'view'} onClick={() => setSheet({ k: 'view' })}>
            {viewTitle(days)}
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

      {/* MK Week Strip: the rolling week holding the shown day; 3 days washes its range. */}
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

      {(tasksPending || unscheduled.length > 0) && (
        <div className="pc-uns">
          <span className="pc-uns-label">Unscheduled{tasksPending ? '' : ` · ${unscheduled.length}`}</span>
          {tasksPending
            ? [0, 1].map((i) => <span key={i} className="pc-chip is-skel" />)
            : unscheduled.map((t) => (
                <button key={t.id} type="button" className="pc-chip" aria-expanded={scheduling?.id === t.id} onClick={() => setSheet({ k: 'schedule', id: t.id })}>
                  <span className="pc-chip-t">{t.title}</span>
                  {t.duration_min != null && <span className="pc-chip-d">{formatDuration(t.duration_min)}</span>}
                </button>
              ))}
        </div>
      )}

      <PhoneGrid
        ref={gridRef}
        days={days}
        step={viewStep(view)}
        today={today}
        now={now}
        events={events}
        look={look}
        pending={marks.pending}
        loading={eventsPending}
        onPage={(dir) => setAnchor((a) => addDays(a, dir * viewStep(view)))}
        onTapSlot={(day, minute) => {
          const start = tapStart(minute)
          // The slot stays in view above the sheet and the keyboard (7c).
          gridRef.current?.scrollToMinute(start, 80)
          setSheet({ k: 'create', day, start })
        }}
        onTapBlock={tapBlock}
        onTapMore={(hidden) => setSheet({ k: 'more', ids: hidden.map((e) => e.id) })}
        onCommit={commit}
        overlay={
          emptyDay && (
            <div className="pc-empty">
              <EmptyState image="/ds/assets/daisy/future.png" line="A clear day — tap any time to plan" action={{ label: 'Plan my day', onClick: () => setSheet({ k: 'plan' }) }} />
            </div>
          )
        }
      />

      {sheet?.k === 'view' && (
        <ActionSheet
          title="View"
          meta="Tap the date title"
          onClose={() => setSheet(null)}
          items={VIEWS.map(({ v, label }) => ({
            label,
            icon: <Icon name="calendar" />,
            hint: v === view ? undefined : v === '3day' ? weekdayRange(visibleDays('3day', anchor, today)) : v === 'week' ? viewTitle(weekPage(anchor, today)) : undefined,
            selected: v === view,
            onSelect: () => setView(v),
          }))}
        />
      )}
      {sheet?.k === 'create' && (
        <QuickCreateSheet day={sheet.day} start={sheet.start} slotRect={slotRect} onClose={() => setSheet(null)} />
      )}
      {block && (
        <BlockSheet event={block} look={look(block)} slotRect={slotRect} pending={marks.pending.has(block.id)} onMove={commit} onClose={() => setSheet(null)} />
      )}
      {sheet?.k === 'more' && (
        <ActionSheet
          title={`${sheet.ids.length} more`}
          meta="At the same time"
          onClose={() => setSheet(null)}
          items={events
            .filter((e) => sheet.ids.includes(e.id))
            .map((e) => {
              const s = eventSpan(e)
              return { label: e.title, icon: <Icon name={e.task_id ? 'tasks' : 'calendar'} />, hint: rangeText(s.start, s.end), onSelect: () => tapBlock(e) }
            })}
        />
      )}
      {scheduling && (
        <ScheduleSheet
          task={scheduling}
          events={events}
          onPlaced={(day) => {
            if (!days.includes(day)) setAnchor(day)
          }}
          onClose={() => setSheet(null)}
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
