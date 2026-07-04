import { useState } from 'react'
import { useTasks, completeTask, toggleTop3 } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { localDateKey } from '../routines/streaks'
import { useSlipping, markReviewed } from '../slipping/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import type { Task } from '../../lib/types'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function isVisible(task: Task, now: Date): boolean {
  if (task.status !== 'todo') return false
  if (task.snoozed_until && new Date(task.snoozed_until) > now) return false
  return true
}

function TaskLine({ task }: { task: Task }) {
  return (
    <li className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
      <input type="checkbox" checked={false} onChange={() => completeTask(task)} />
      <span className="flex-1">{task.title}</span>
      <button
        type="button"
        onClick={() => toggleTop3(task)}
        className={task.top3 ? 'text-amber-500' : 'text-slate-300'}
      >
        ★
      </button>
    </li>
  )
}

function TodaysRoutines() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const today = new Date()
  const todayKey = localDateKey(today)
  const scheduledToday = routines.filter((r) => r.active && r.cadence.weekdays.includes(today.getDay()))

  if (scheduledToday.length === 0) return null

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-slate-500">Routines</h2>
      <ul className="space-y-1">
        {scheduledToday.map((r) => {
          const done = completions.some((c) => c.routine_id === r.id && c.completed_on === todayKey)
          return (
            <li key={r.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
              <input type="checkbox" checked={done} onChange={() => toggleCompletion(r)} />
              <span className={done ? 'flex-1 text-slate-400 line-through' : 'flex-1'}>{r.name}</span>
              <span className="text-xs text-slate-400">{r.time_of_day}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SlippingSidebar() {
  const { data: rows = [] } = useSlipping()
  if (rows.length === 0) return null
  return (
    <aside className="w-full space-y-2 md:w-56">
      <h2 className="text-sm font-semibold text-amber-600">Slipping</h2>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={`${row.entity_type}-${row.entity_id}`} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
            <p className="font-medium">{row.entity_name}</p>
            <p className="text-slate-500">{Math.floor(row.days_since)} days untouched</p>
            <button type="button" onClick={() => markReviewed(row)} className="mt-1 text-amber-700 underline">
              reviewed
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function TodayPage() {
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const [ritual, setRitual] = useState<'morning' | 'evening' | null>(null)
  const now = new Date()
  const visible = tasks.filter((t) => isVisible(t, now))

  const top3 = visible.filter((t) => t.top3)
  const dueToday = visible.filter(
    (t) => !t.top3 && t.due_at && new Date(t.due_at) >= startOfToday() && new Date(t.due_at) <= endOfToday(),
  )
  const overdue = visible.filter((t) => !t.top3 && t.due_at && new Date(t.due_at) < startOfToday())

  const todaysEvents = events
    .filter((e) => new Date(e.starts_at) >= startOfToday() && new Date(e.starts_at) <= endOfToday())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Today</h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRitual('morning')} className="rounded border px-2 py-1 text-xs">
              Morning ritual
            </button>
            <button type="button" onClick={() => setRitual('evening')} className="rounded border px-2 py-1 text-xs">
              Evening ritual
            </button>
            <VoiceCaptureButton />
          </div>
        </div>

        {ritual === 'morning' && <MorningRitual onClose={() => setRitual(null)} />}
        {ritual === 'evening' && <EveningRitual onClose={() => setRitual(null)} />}

        <ResurfaceCard />

        {todaysEvents.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-slate-500">Timeline</h2>
            <ul className="space-y-1">
              {todaysEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                  <span className="w-32 shrink-0 text-xs text-slate-400">
                    {new Date(e.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {' – '}
                    {new Date(e.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span>{e.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-500">Top 3</h2>
          {top3.length === 0 ? (
            <p className="text-sm text-slate-400">Star up to 3 tasks from Tasks to feature them here.</p>
          ) : (
            <ul className="space-y-1">
              {top3.map((t) => (
                <TaskLine key={t.id} task={t} />
              ))}
            </ul>
          )}
        </section>

        <TodaysRoutines />

        {overdue.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-red-500">Overdue</h2>
            <ul className="space-y-1">
              {overdue.map((t) => (
                <TaskLine key={t.id} task={t} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-500">Due today</h2>
          {dueToday.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing else due today.</p>
          ) : (
            <ul className="space-y-1">
              {dueToday.map((t) => (
                <TaskLine key={t.id} task={t} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <SlippingSidebar />
    </div>
  )
}
