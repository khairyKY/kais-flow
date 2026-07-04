import { useEffect, useRef } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { CalendarGrid } from './CalendarGrid'
import { useCalendarEvents, createEvent, moveOrResizeEvent, deleteEvent, scheduleTask } from './api'
import { useTasks } from '../tasks/api'

export function CalendarPage() {
  const { data: events = [] } = useCalendarEvents()
  const { data: tasks = [] } = useTasks()
  const sidebarRef = useRef<HTMLDivElement>(null)

  const unscheduled = tasks.filter((t) => t.status === 'todo' && !t.scheduled_start)

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

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <aside ref={sidebarRef} className="w-full space-y-2 md:w-56">
        <h2 className="text-sm font-semibold text-slate-500">Unscheduled</h2>
        {unscheduled.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing waiting to be time-blocked.</p>
        ) : (
          <ul className="space-y-1">
            {unscheduled.map((t) => (
              <li
                key={t.id}
                className="unscheduled-task cursor-grab rounded border bg-white px-2 py-1 text-xs shadow-sm"
                data-task-id={t.id}
                data-title={t.title}
              >
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="flex-1">
        <CalendarGrid
          events={events.map((e) => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at }))}
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
  )
}
