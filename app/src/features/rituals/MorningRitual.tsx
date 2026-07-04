import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTasks, rescheduleDue, deleteTask, toggleTop3 } from '../tasks/api'
import { usePendingInboxItems, fileToTask, dismissInboxItem } from '../inbox/api'

const STEPS = ['overdue', 'top3', 'inbox', 'block'] as const

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function MorningRitual({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = usePendingInboxItems()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const overdue = tasks.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) < startOfToday)
  const top3 = tasks.filter((t) => t.top3)
  const candidatesForTop3 = tasks.filter((t) => t.status === 'todo' && !t.top3)

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1)
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">
            Morning ritual — step {stepIndex + 1}/{STEPS.length}
          </h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-400">
            skip
          </button>
        </div>

        {step === 'overdue' && (
          <div className="space-y-2">
            <h3 className="font-medium">Review overdue</h3>
            {overdue.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing overdue.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {overdue.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <span className="flex-1">{t.title}</span>
                    <button type="button" onClick={() => rescheduleDue(t, tomorrowIso())} className="text-xs text-slate-500">
                      push to tomorrow
                    </button>
                    <button type="button" onClick={() => deleteTask(t)} className="text-xs text-red-500">
                      drop
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'top3' && (
          <div className="space-y-2">
            <h3 className="font-medium">Pick your Top-3 ({top3.length}/3)</h3>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {top3.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                  <span className="flex-1">★ {t.title}</span>
                  <button type="button" onClick={() => toggleTop3(t)} className="text-xs text-slate-500">
                    unstar
                  </button>
                </li>
              ))}
              {candidatesForTop3.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <span className="flex-1">{t.title}</span>
                  <button
                    type="button"
                    onClick={() => toggleTop3(t)}
                    disabled={top3.length >= 3}
                    className="text-xs text-amber-600 disabled:opacity-30"
                  >
                    star
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 'inbox' && (
          <div className="space-y-2">
            <h3 className="font-medium">Inbox to zero</h3>
            {inboxItems.length === 0 ? (
              <p className="text-sm text-slate-400">Inbox zero already.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {inboxItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <span className="flex-1">{item.raw_text}</span>
                    <button type="button" onClick={() => fileToTask(item)} className="text-xs text-slate-900">
                      file
                    </button>
                    <button type="button" onClick={() => dismissInboxItem(item)} className="text-xs text-slate-500">
                      dismiss
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'block' && (
          <div className="space-y-2">
            <h3 className="font-medium">Time-block your day</h3>
            <p className="text-sm text-slate-500">Drag your Top-3 and anything important onto today's calendar.</p>
            <button
              type="button"
              onClick={() => {
                navigate('/calendar')
                onClose()
              }}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
            >
              Open calendar
            </button>
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
