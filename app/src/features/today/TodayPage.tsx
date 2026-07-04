import { useTasks, completeTask, toggleTop3 } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
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

export function TodayPage() {
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Today</h1>
        <VoiceCaptureButton />
      </div>

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
  )
}
