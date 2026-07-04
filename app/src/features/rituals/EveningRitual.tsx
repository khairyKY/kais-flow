import { useState } from 'react'
import { useTasks, completeTask, rescheduleDue } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'

const STEPS = ['sweep', 'preview'] as const

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

function dayBounds(offsetDays: number): [Date, Date] {
  const start = new Date()
  start.setDate(start.getDate() + offsetDays)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return [start, end]
}

export function EveningRitual({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()

  const [, todayEnd] = dayBounds(0)
  const [tomorrowStart, tomorrowEnd] = dayBounds(1)

  const todaysOpen = tasks.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) <= todayEnd)
  const top3 = tasks.filter((t) => t.top3)
  const tomorrowsDue = tasks.filter(
    (t) => t.status === 'todo' && t.due_at && new Date(t.due_at) >= tomorrowStart && new Date(t.due_at) <= tomorrowEnd,
  )
  const tomorrowsEvents = events.filter(
    (e) => new Date(e.starts_at) >= tomorrowStart && new Date(e.starts_at) <= tomorrowEnd,
  )

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1)
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">
            Evening ritual — step {stepIndex + 1}/{STEPS.length}
          </h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-400">
            skip
          </button>
        </div>

        {step === 'sweep' && (
          <div className="space-y-2">
            <h3 className="font-medium">Sweep today</h3>
            {todaysOpen.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing left open today.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {todaysOpen.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <span className="flex-1">{t.title}</span>
                    <button type="button" onClick={() => completeTask(t)} className="text-xs text-emerald-600">
                      done
                    </button>
                    <button type="button" onClick={() => rescheduleDue(t, tomorrowIso())} className="text-xs text-slate-500">
                      roll to tomorrow
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-2">
            <h3 className="font-medium">Tomorrow preview</h3>
            <p className="text-xs font-semibold text-slate-500">Top-3</p>
            <p className="text-sm">{top3.length ? top3.map((t) => t.title).join(', ') : 'none set'}</p>
            <p className="text-xs font-semibold text-slate-500">Due tomorrow</p>
            <p className="text-sm">{tomorrowsDue.length ? tomorrowsDue.map((t) => t.title).join(', ') : 'nothing due'}</p>
            <p className="text-xs font-semibold text-slate-500">Scheduled</p>
            <p className="text-sm">{tomorrowsEvents.length ? tomorrowsEvents.map((e) => e.title).join(', ') : 'nothing blocked yet'}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-2">
          <button type="button" onClick={next} className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
            {stepIndex < STEPS.length - 1 ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
