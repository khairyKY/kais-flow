import { useEffect, useRef, useState, useMemo } from 'react'
import { Link } from 'react-router'
import { Draggable } from '@fullcalendar/interaction'
import { CalendarGrid } from './CalendarGrid'
import { useCalendarEvents, createEvent, moveOrResizeEvent, resizeEvent, scheduleTask, deleteEvent } from './api'
import { useTasks, completeTask } from '../tasks/api'
import { filterByScope, type RailScope, type RailScopeKind } from '../tasks/grouping'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { daisyAsset } from '../../lib/gardenAssets'
import { EventDetailsPanel } from './EventDetailsPanel'
import { ContextMenu } from '../../components/ContextMenu'
import { Select } from '../../components/Select'
import type { ContextMenuItem } from '../../components/ContextMenu'
import type { CalendarEvent, CalendarEventType } from '../../lib/types'

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

function weekOfLabel(): string {
  const d = new Date()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** An unsaved draft for the right-click "New Event"/"New Time Block" flow — Save (via updateEvent's
 * upsert) is what actually inserts it; closing without saving just discards it, nothing written. */
function draftEvent(startIso: string, allDay: boolean, type: CalendarEventType): CalendarEvent {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + (allDay ? 24 * 60 : 30) * 60000)
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: type === 'time_block' ? 'New Time Block' : 'New Event',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: allDay,
    task_id: null,
    source: 'native',
    gcal_id: null,
    gcal_etag: null,
    busy: true,
    type,
    color: null,
    created_at: now,
    updated_at: now,
  }
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

export function CalendarPage() {
  const { data: events = [] } = useCalendarEvents()
  const { data: tasks = [] } = useTasks()
  const { data: settings } = useAppSettings()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isNewEvent, setIsNewEvent] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  const [scope, setScope] = useState<RailScope>({ kind: 'smart', id: 'today' })

  // Any task in any scope can be dragged onto the grid — already-scheduled tasks stay out of
  // the rail so dropping never creates a duplicate block for the same task.
  const railTasks = filterByScope(tasks, scope).filter((t) => !t.scheduled_start)
  const daisy = daisyAsset(new Date().getHours())
  const conflicts = useMemo(() => computeConflicts(events), [events])
  const dayCount = settings?.calendar_day_count ?? 7
  // 2–6 plus whatever's currently stored (e.g. 7/14 from the Settings page) so the picker never hides the active value.
  const dayCountOptions = Array.from(new Set([2, 3, 4, 5, 6, dayCount])).sort((a, b) => a - b)

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
    setIsNewEvent(false)
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
    } else if (event.type === 'time_block') {
      items.push({ label: 'Edit', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Change color', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteEvent(event) } })
    } else {
      items.push({ label: 'Edit', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Change color', onClick: () => { setContextMenu(null); openExisting(event) } })
      items.push({ label: 'Delete', danger: true, onClick: () => { setContextMenu(null); deleteEvent(event) } })
    }
    setContextMenu({ items, x, y })
  }

  function handleGridContextMenu(iso: string, allDay: boolean, x: number, y: number) {
    function openDraft(type: CalendarEventType) {
      setContextMenu(null)
      setIsNewEvent(true)
      setSelectedEvent(draftEvent(iso, allDay, type))
    }
    setContextMenu({
      items: [
        { label: 'New Event', onClick: () => openDraft('event') },
        { label: 'New Time Block', onClick: () => openDraft('time_block') },
      ],
      x,
      y,
    })
  }

  function handleExternalDrop(taskId: string, start: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const end = new Date(new Date(start).getTime() + (task.duration_min ?? 30) * 60000).toISOString()
    scheduleTask(task, start, end)
  }

  const railTilts = [-0.6, 0.5, -0.4, 0.55, -0.3]
  const railTapes: { side: 'left' | 'right' | 'center'; tint: string; rotate: number }[] = [
    { side: 'left', tint: 'rgba(168,160,190,0.35)', rotate: -2 },
    { side: 'right', tint: 'rgba(212,168,176,0.35)', rotate: 2 },
    { side: 'center', tint: 'rgba(138,154,126,0.35)', rotate: -1.5 },
  ]

  return (
    <><div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Calendar · {weekOfLabel()}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Calendar</h1>
          <Link
            to="/planning"
            style={{
              display: 'inline-block',
              marginTop: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              textDecoration: 'underline',
            }}
          >
            → Planning board
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              N-day view
            </span>
            <Select
              value={String(dayCount)}
              onChange={(v) => updateAppSetting('calendar_day_count', Number(v))}
              options={dayCountOptions.map((n) => ({ value: String(n), label: `${n}d` }))}
              ariaLabel="N-day view length"
              style={{ fontSize: 11, padding: '4px 7px' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', transform: 'rotate(1deg)' }}>
          <img src={`assets/daisy/${daisy.src}.png`} alt="Daisy" style={{ height: 84, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
          <span
            style={{
              position: 'absolute',
              top: 40,
              left: '50%',
              width: 38,
              height: 11,
              marginLeft: -19,
              background: 'rgba(168,160,190,0.38)',
              backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
              transform: 'rotate(-3deg)',
              borderRadius: 1,
            }}
          />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>petals open as the day fills</span>
        </div>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 28px' }} />

      <style>{`
        .calendar-columns { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 28px; align-items: start; }
        @media (max-width: 767px) {
          .calendar-columns { grid-template-columns: minmax(0, 1fr); }
          .calendar-rail { display: flex; flex-direction: row; overflow-x: auto; gap: 10px; padding-bottom: 4px; }
          .calendar-rail > div { flex: 0 0 200px; }
        }
      `}</style>

      <div className="calendar-columns">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              Scope
            </span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--border-dashed)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <Select
              value={scope.kind}
              onChange={(v) => onScopeKindChange(v as RailScopeKind)}
              options={SCOPE_KIND_OPTIONS}
              ariaLabel="Rail scope type"
              style={{ fontSize: 11, padding: '5px 7px', flex: 'none', maxWidth: 100 }}
            />
            <Select
              value={scope.id}
              onChange={(id) => setScope((s) => ({ ...s, id }))}
              options={scopeValueOptions}
              ariaLabel="Rail scope value"
              style={{ fontSize: 11, padding: '5px 7px', flex: 1, minWidth: 0 }}
            />
          </div>
          <div ref={sidebarRef} className="calendar-rail" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {railTasks.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0 }}>Nothing here to block.</p>
            ) : (
              railTasks.map((t, i) => {
                const tape = railTapes[i % railTapes.length]
                return (
                  <div
                    key={t.id}
                    className="unscheduled-task"
                    data-task-id={t.id}
                    data-title={t.title}
                    data-duration={t.duration_min ?? 30}
                    style={{
                      position: 'relative',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--line-card)',
                      boxShadow: 'var(--shadow-card)',
                      borderRadius: 'var(--radius-sharp)',
                      padding: '10px 12px',
                      cursor: 'grab',
                      transform: `rotate(${railTilts[i % railTilts.length]}deg)`,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: -7,
                        ...(tape.side === 'center' ? { left: '50%', marginLeft: -17 } : { [tape.side]: 14 }),
                        width: 34,
                        height: 11,
                        background: tape.tint,
                        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
                        transform: `rotate(${tape.rotate}deg)`,
                        borderRadius: 1,
                      }}
                    />
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.title}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 3 }}>drag to block · {t.duration_min ?? 30} min</div>
                  </div>
                )
              })
            )}
          </div>
          {railTasks.length > 0 && (
            <p style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--text-tertiary)', margin: '16px 0 0', transform: 'rotate(-0.8deg)' }}>
              each dropped chip opens one petal ↗
            </p>
          )}
        </div>

        <div
          style={{
            position: 'relative',
            background: 'var(--bg-surface)',
            border: '1px solid var(--line-card)',
            boxShadow: 'var(--shadow-panel)',
            borderRadius: 'var(--radius-sharp)',
            padding: '0 0 6px',
            transform: 'rotate(0.15deg)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -9,
              left: 44,
              width: 64,
              height: 16,
              background: 'rgba(168,160,190,0.38)',
              backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
              transform: 'rotate(-2deg)',
              borderRadius: 1,
              boxShadow: 'var(--shadow-crisp)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: -9,
              right: 60,
              width: 64,
              height: 16,
              background: 'rgba(168,160,190,0.3)',
              backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
              transform: 'rotate(2deg)',
              borderRadius: 1,
              boxShadow: 'var(--shadow-crisp)',
            }}
          />
          <div>
            <CalendarGrid
              events={events.map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, allDay: e.all_day, type: e.type ?? 'event', color: e.color, linked: Boolean(e.task_id) }))}
              onCreate={(start, end) => createEvent('Block', start, end)}
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
              dayCount={dayCount}
              onEventContextMenu={handleEventContextMenu}
              onGridContextMenu={handleGridContextMenu}
              conflictedIds={Array.from(conflicts.keys())}
            />
          </div>
        </div>
      </div>
    </div>
      {selectedEvent && (
        <EventDetailsPanel
          event={selectedEvent}
          conflicts={conflicts.get(selectedEvent.id) ?? []}
          onClose={() => setSelectedEvent(null)}
          isNew={isNewEvent}
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
