import { useEffect, useMemo, useRef, useState } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { CalendarGrid, type CalendarGridHandle, type CalendarGridView } from './CalendarGrid'
import { useCalendarEvents, moveOrResizeEvent, resizeEvent, scheduleTask, deleteEvent } from './api'
import { useTasks, completeTask } from '../tasks/api'
import { filterByScope, type RailScope, type RailScopeKind } from '../tasks/grouping'
import { resolveTag, daysOverdue, formatDuration } from '../tasks/taskDisplay'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { daisyAsset } from '../../lib/gardenAssets'
import { useMotionEnabled } from '../../lib/motion'
import { localDateKey } from '../routines/streaks'
import { localTimeKey } from './eventTime'
import { EventDetailsPanel } from './EventDetailsPanel'
import { QuickCreate, type QuickCreateKind } from './QuickCreate'
import { ContextMenu } from '../../components/ContextMenu'
import { Select } from '../../components/Select'
import type { ContextMenuItem } from '../../components/ContextMenu'
import type { CalendarEvent } from '../../lib/types'

// ── Calendar.dc.html 1a (desktop: task rail + time-grid) · 1b (iPhone day view). ──

type ViewKind = 'day' | 'ndays' | 'week' | 'month'
const VIEW_MAP: Record<ViewKind, CalendarGridView> = { day: 'timeGridDay', ndays: 'customDayCount', week: 'timeGridWeek', month: 'dayGridMonth' }

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

export function CalendarPage() {
  const { data: events = [] } = useCalendarEvents()
  const { data: tasks = [] } = useTasks()
  const { data: settings } = useAppSettings()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<CalendarGridHandle>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [contextMenu, setContextMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)
  const [scope, setScope] = useState<RailScope>({ kind: 'smart', id: 'today' })
  // Calendar.dc.html 1b — phones open on the day view, not a 7-column squeeze.
  const [viewKind, setViewKind] = useState<ViewKind>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 767 ? 'day' : 'week',
  )
  // Effects 21 — the chip created by a rail drop plays settle-in once.
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null)
  const [rangeInfo, setRangeInfo] = useState<{ title: string; start: Date; end: Date } | null>(null)

  const railTasks = filterByScope(tasks, scope).filter((t) => !t.scheduled_start)
  const daisy = daisyAsset(new Date().getHours())
  const motionOn = useMotionEnabled()
  const conflicts = useMemo(() => computeConflicts(events), [events])
  const load = useMemo(() => todaysLoad(events), [events])
  const dayCount = settings?.calendar_day_count ?? 4

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
  }, [railTasks.length])

  function openExisting(event: CalendarEvent) {
    setSelectedEvent(event)
  }

  function handleEventClick(id: string) {
    setContextMenu(null)
    const event = events.find((e) => e.id === id)
    if (event) openExisting(event)
  }

  function handleEventContextMenu(id: string, x: number, y: number) {
    setContextMenu(null)
    const event = events.find((e) => e.id === id)
    if (!event) return
    const items: ContextMenuItem[] = []
    if (event.type === 'task') {
      items.push({ label: 'Edit Task', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Complete', onClick: () => { setContextMenu(null); const t = tasks.find((t) => t.id === event.task_id); if (t) completeTask(t) } })
      items.push({ label: 'Unschedule', onClick: () => { setContextMenu(null); deleteEvent(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteEvent(event) } })
    } else {
      items.push({ label: 'Edit', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteEvent(event) } })
    }
    setContextMenu({ items, x, y })
  }

  // Empty-slot click/drag → Editor 2a's quick-create popover, kind defaults to Event.
  function handleGridCreate(info: { start: string; end: string; allDay: boolean; x: number; y: number }) {
    const start = new Date(info.start)
    const end = new Date(info.end)
    setQuickCreate({
      kind: 'event',
      slot: { date: localDateKey(start), start: info.allDay ? '' : localTimeKey(start), end: info.allDay ? '' : localTimeKey(end), allDay: info.allDay },
      anchor: { x: info.x, y: info.y },
    })
  }

  // Right-click empty grid space → Editor 2a/2b, kind pre-picked from the menu.
  function handleGridContextMenu(iso: string, allDay: boolean, x: number, y: number) {
    function openKind(kind: QuickCreateKind) {
      setContextMenu(null)
      const start = new Date(iso)
      const end = new Date(start.getTime() + (allDay ? 24 * 60 : 30) * 60000)
      setQuickCreate({
        kind,
        slot: { date: localDateKey(start), start: allDay ? '' : localTimeKey(start), end: allDay ? '' : localTimeKey(end), allDay },
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

  function handleExternalDrop(taskId: string, start: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const end = new Date(new Date(start).getTime() + (task.duration_min ?? 30) * 60000).toISOString()
    const ev = scheduleTask(task, start, end)
    if (motionOn) {
      setJustDroppedId(ev.id)
      window.setTimeout(() => setJustDroppedId((cur) => (cur === ev.id ? null : cur)), 800)
    }
  }

  function cycleDayCount() {
    updateAppSetting('calendar_day_count', dayCount >= 6 ? 2 : dayCount + 1)
    setViewKind('ndays')
  }

  const pillCircle = { width: 32, height: 32, border: '1px solid var(--line-solid)', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)', cursor: 'pointer', flex: 'none' as const }

  return (
    <>
      <style>{`
        .cal-shell { display: flex; align-items: stretch; height: 100%; min-height: 0; }
        .cal-rail { width: 244px; flex: none; border-right: 1px dashed var(--line-solid); display: flex; flex-direction: column; padding: 22px 20px; overflow-y: auto; }
        .cal-rail-cards { display: flex; flex-direction: column; gap: 10px; }
        .cal-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 20px 26px 24px; }
        @media (max-width: 767px) {
          .cal-shell { flex-direction: column; }
          .cal-rail { width: 100%; border-right: none; border-bottom: 1px dashed var(--line-solid); padding: 16px; }
          .cal-rail-cards { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
          .cal-rail-cards > div { flex: 0 0 190px; }
          .cal-main { padding: 16px; }
        }
      `}</style>

      <div className="cal-shell">
        <aside className="cal-rail">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Unscheduled</div>
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', margin: '3px 0 12px' }}>drag onto a time to plant it ✿</div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <Select
              value={scope.kind}
              onChange={(v) => onScopeKindChange(v as RailScopeKind)}
              options={SCOPE_KIND_OPTIONS}
              ariaLabel="Rail scope type"
              style={{ fontSize: 10.5, padding: '4px 6px', flex: 'none', maxWidth: 92 }}
            />
            <Select
              value={scope.id}
              onChange={(id) => setScope((s) => ({ ...s, id }))}
              options={scopeValueOptions}
              ariaLabel="Rail scope value"
              style={{ fontSize: 10.5, padding: '4px 6px', flex: 1, minWidth: 0 }}
            />
          </div>

          <div
            onClick={openQuickAddTask}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 11px', marginBottom: 16, cursor: 'pointer' }}
          >
            <span style={{ width: 14, height: 14, border: '1.5px solid var(--ink-hairline)', borderRadius: 4, flex: 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Quick add task…</span>
          </div>

          <div ref={sidebarRef} className="cal-rail-cards">
            {railTasks.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>Nothing here to block.</p>
            ) : (
              railTasks.map((t, i) => {
                const tag = resolveTag(t, domains, projects, areas)
                const overdue = t.due_at ? daysOverdue(t.due_at) : 0
                return (
                  <div
                    key={t.id}
                    className="unscheduled-task"
                    data-task-id={t.id}
                    data-title={t.title}
                    data-duration={t.duration_min ?? 30}
                    style={{
                      background: 'var(--paper-parchment)',
                      border: '1px solid var(--line-card)',
                      boxShadow: 'var(--shadow-crisp)',
                      borderRadius: 3,
                      padding: '11px 12px',
                      cursor: 'grab',
                      transform: `rotate(${RAIL_TILTS[i % RAIL_TILTS.length]}deg)`,
                    }}
                  >
                    <div style={{ fontSize: 13.5, color: 'var(--ink-body)', lineHeight: 1.35 }}>{t.title}</div>
                    <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      {overdue > 0 ? (
                        <span style={{ color: 'var(--acc-terra)' }}>Overdue {overdue}d</span>
                      ) : (
                        <>
                          {tag && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--acc-moss)' }} />
                              {tag.label}
                            </span>
                          )}
                          {t.duration_min != null && <span>{formatDuration(t.duration_min).toLowerCase()}</span>}
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
            <img src={`/ds/assets/daisy/${daisy.src}.png`} alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
              {load.blocked} blocked<br />{load.freeHours}h free today
            </div>
          </div>
        </aside>

        <div className="cal-main">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src={`/ds/assets/daisy/${daisy.src}.png`} alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  Week {weekNumber(rangeInfo?.start ?? new Date())} · {daisy.note}
                </div>
                <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                  {rangeInfo ? rangeLabel(rangeInfo.start, rangeInfo.end, viewKind) : ''}
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, overflow: 'hidden' }}>
                {(['day', 'ndays', 'week', 'month'] as ViewKind[]).map((vk) => {
                  const on = viewKind === vk
                  const label = vk === 'day' ? 'Day' : vk === 'ndays' ? `${dayCount}-day` : vk === 'week' ? 'Week' : 'Month'
                  return (
                    <span
                      key={vk}
                      onClick={() => (vk === 'ndays' ? cycleDayCount() : setViewKind(vk))}
                      title={vk === 'ndays' ? 'Click to cycle 2–6 days' : undefined}
                      style={{
                        padding: '7px 13px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        color: on ? 'var(--ink-body)' : 'var(--ink-muted)',
                        background: on ? 'var(--paper-parchment)' : 'transparent',
                        borderLeft: vk !== 'day' ? '1px solid var(--line-card)' : undefined,
                      }}
                    >
                      {label}
                    </span>
                  )
                })}
              </div>
              <span onClick={() => gridRef.current?.prev()} style={pillCircle}>‹</span>
              <span onClick={() => gridRef.current?.today()} style={{ padding: '0 14px', height: 32, border: '1px solid var(--line-solid)', borderRadius: 999, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, color: 'var(--ink-body)', cursor: 'pointer' }}>Today</span>
              <span onClick={() => gridRef.current?.next()} style={pillCircle}>›</span>
            </div>
          </div>

          <div className={motionOn ? 'cal-motion-on' : undefined} style={{ flex: 1, background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)', borderRadius: 4, boxShadow: 'var(--shadow-panel)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CalendarGrid
              ref={gridRef}
              initialView={VIEW_MAP[viewKind]}
              hideToolbar
              onRangeChange={setRangeInfo}
              events={events.map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, allDay: e.all_day, type: e.type ?? 'event', color: e.color, linked: Boolean(e.task_id) }))}
              onCreate={handleGridCreate}
              onMove={(id, start, end) => {
                const event = events.find((e) => e.id === id)
                if (event) moveOrResizeEvent(event, start, end)
              }}
              onResize={(id, start, end) => {
                const event = events.find((e) => e.id === id)
                if (event) resizeEvent(event, start, end)
              }}
              onEventClick={handleEventClick}
              onExternalDrop={handleExternalDrop}
              justDroppedId={justDroppedId}
              dayCount={dayCount}
              onEventContextMenu={handleEventContextMenu}
              onGridContextMenu={handleGridContextMenu}
              conflictedIds={Array.from(conflicts.keys())}
            />
          </div>
        </div>
      </div>

      {selectedEvent && (
        <EventDetailsPanel
          event={selectedEvent}
          conflicts={conflicts.get(selectedEvent.id) ?? []}
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {quickCreate && (
        <QuickCreate
          initialKind={quickCreate.kind}
          slot={quickCreate.slot}
          anchor={quickCreate.anchor}
          onClose={() => setQuickCreate(null)}
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
