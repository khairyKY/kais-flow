import { useState } from 'react'
import {
  useRoutines,
  useRoutineCompletions,
  createRoutine,
  createChallenge,
  archiveRoutine,
  toggleCompletion,
} from './api'
import { computeStreak, localDateKey } from './streaks'
import type { Routine, RoutineCompletion, TimeOfDay } from '../../lib/types'

const SECTIONS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
]

const HISTORY_DAYS = 14

function History({ routine, completions }: { routine: Routine; completions: RoutineCompletion[] }) {
  const done = new Set(completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on))
  const days: { key: string; scheduled: boolean; done: boolean }[] = []
  for (let n = HISTORY_DAYS - 1; n >= 0; n--) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    const key = localDateKey(d)
    days.push({ key, scheduled: routine.cadence.weekdays.includes(d.getDay()), done: done.has(key) })
  }
  return (
    <div className="flex gap-0.5">
      {days.map((d) => (
        <div
          key={d.key}
          title={d.key}
          className={`h-3 w-3 rounded-sm ${
            !d.scheduled ? 'bg-slate-100' : d.done ? 'bg-emerald-500' : 'bg-red-200'
          }`}
        />
      ))}
    </div>
  )
}

function RoutineRow({ routine, completions }: { routine: Routine; completions: RoutineCompletion[] }) {
  const routineCompletions = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  const { current, best } = computeStreak(routineCompletions, routine.cadence)
  const todayKey = localDateKey(new Date())
  const doneToday = routineCompletions.includes(todayKey)

  const isChallenge = Boolean(routine.challenge_start && routine.challenge_end)
  let challengeProgress: string | null = null
  if (isChallenge && routine.challenge_start && routine.challenge_end) {
    const start = new Date(routine.challenge_start)
    const end = new Date(routine.challenge_end)
    const totalDays =
      routine.cadence.weekdays.length === 7
        ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
        : null
    const doneInRange = routineCompletions.filter((d) => d >= routine.challenge_start! && d <= routine.challenge_end!).length
    challengeProgress = totalDays ? `${doneInRange}/${totalDays} days` : `${doneInRange} done`
    const today = new Date()
    if (today > end) return null // challenge window over — disappears per spec
  }

  return (
    <li className="space-y-1 rounded border p-2 text-sm">
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={doneToday} onChange={() => toggleCompletion(routine)} />
        <span className="flex-1">
          {routine.name}
          {isChallenge && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{challengeProgress}</span>}
        </span>
        <span className="text-xs text-slate-500">
          🔥 {current} · best {best}
        </span>
        <button type="button" onClick={() => archiveRoutine(routine)} className="text-xs text-slate-400">
          archive
        </button>
      </div>
      <History routine={routine} completions={completions} />
    </li>
  )
}

function AddRoutineForm() {
  const [name, setName] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [isChallenge, setIsChallenge] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        if (isChallenge && start && end) {
          createChallenge(name.trim(), timeOfDay, { weekdays: [0, 1, 2, 3, 4, 5, 6] }, start, end)
        } else {
          createRoutine(name.trim(), timeOfDay)
        }
        setName('')
        setStart('')
        setEnd('')
      }}
      className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New routine or challenge"
        className="rounded border px-2 py-1"
      />
      <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)} className="rounded border px-1 py-1">
        <option value="morning">morning</option>
        <option value="afternoon">afternoon</option>
        <option value="evening">evening</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" checked={isChallenge} onChange={(e) => setIsChallenge(e.target.checked)} />
        challenge
      </label>
      {isChallenge && (
        <>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border px-1 py-1 text-xs" />
          <span className="text-xs">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border px-1 py-1 text-xs" />
        </>
      )}
      <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-white">
        Add
      </button>
    </form>
  )
}

export function RoutinesPage() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const active = routines.filter((r) => r.active)

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Routines</h1>
      <AddRoutineForm />
      {SECTIONS.map((section) => {
        const items = active.filter((r) => r.time_of_day === section.key)
        return (
          <section key={section.key}>
            <h2 className="mb-1 text-sm font-semibold text-slate-500">{section.label}</h2>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing here yet.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((r) => (
                  <RoutineRow key={r.id} routine={r} completions={completions} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
