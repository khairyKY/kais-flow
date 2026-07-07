import { useEffect, useRef } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { CalendarGrid } from './CalendarGrid'
import { useCalendarEvents, createEvent, moveOrResizeEvent, deleteEvent, scheduleTask } from './api'
import { useTasks } from '../tasks/api'
import { daisyAsset } from '../../lib/gardenAssets'

function weekOfLabel(): string {
  const d = new Date()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export function CalendarPage() {
  const { data: events = [] } = useCalendarEvents()
  const { data: tasks = [] } = useTasks()
  const sidebarRef = useRef<HTMLDivElement>(null)

  const unscheduled = tasks.filter((t) => t.status === 'todo' && !t.scheduled_start)
  const daisy = daisyAsset(new Date().getHours())

  useEffect(() => {
    if (!sidebarRef.current) return
    const draggable = new Draggable(sidebarRef.current, {
      itemSelector: '.unscheduled-task',
      eventData: (el) => ({ title: el.dataset.title ?? '', duration: '00:30' }),
    })
    return () => draggable.destroy()
  }, [unscheduled.length])

  function handleEventClick(id: string) {
    const event = events.find((e) => e.id === id)
    if (!event) return
    if (window.confirm(`Delete "${event.title}" from the calendar? The task itself stays.`)) {
      deleteEvent(event)
    }
  }

  function handleExternalDrop(taskId: string, start: string, end: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (task) scheduleTask(task, start, end)
  }

  const railTilts = [-0.6, 0.5, -0.4, 0.55, -0.3]
  const railTapes: { side: 'left' | 'right' | 'center'; tint: string; rotate: number }[] = [
    { side: 'left', tint: 'rgba(168,160,190,0.35)', rotate: -2 },
    { side: 'right', tint: 'rgba(212,168,176,0.35)', rotate: 2 },
    { side: 'center', tint: 'rgba(138,154,126,0.35)', rotate: -1.5 },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Calendar · {weekOfLabel()}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Calendar</h1>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              Unscheduled
            </span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--border-dashed)' }} />
          </div>
          <div ref={sidebarRef} className="calendar-rail" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unscheduled.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0 }}>Nothing waiting to be time-blocked.</p>
            ) : (
              unscheduled.map((t, i) => {
                const tape = railTapes[i % railTapes.length]
                return (
                  <div
                    key={t.id}
                    className="unscheduled-task"
                    data-task-id={t.id}
                    data-title={t.title}
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
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 3 }}>drag to block · 30 min</div>
                  </div>
                )
              })
            )}
          </div>
          {unscheduled.length > 0 && (
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
          <CalendarGrid
            events={events.map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, linked: Boolean(e.task_id) }))}
            onCreate={(start, end) => createEvent('Block', start, end)}
            onMove={(id, start, end) => {
              const event = events.find((e) => e.id === id)
              if (event) moveOrResizeEvent(event, start, end)
            }}
            onResize={(id, start, end) => {
              const event = events.find((e) => e.id === id)
              if (event) moveOrResizeEvent(event, start, end)
            }}
            onEventClick={handleEventClick}
            onExternalDrop={handleExternalDrop}
          />
        </div>
      </div>
    </div>
  )
}
