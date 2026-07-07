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
import { useToastStore } from '../../lib/toastStore'
import type { Routine, RoutineCompletion, TimeOfDay } from '../../lib/types'

const SECTIONS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
]

const HISTORY_DAYS = 14

function vineAsset(longestStreak: number): string {
  if (longestStreak === 0) return 'bare'
  if (longestStreak <= 3) return 'sprouting'
  if (longestStreak <= 7) return 'flowering'
  return 'lush'
}

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
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flex: 'none' }}>
      {days.map((d) => (
        <span
          key={d.key}
          title={d.key}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            display: 'inline-block',
            background: !d.scheduled ? 'var(--bg-input)' : d.done ? 'var(--acc-moss)' : 'color-mix(in oklch, var(--acc-terra) 15%, var(--paper-bone))',
            border: `1px solid ${!d.scheduled ? 'var(--border-default)' : d.done ? 'var(--acc-moss)' : 'var(--acc-terra)'}`,
          }}
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

  function toggle() {
    toggleCompletion(routine)
    useToastStore.getState().push({ message: doneToday ? 'Streak stepped back.' : 'Routine completed! Keep growing ✿' })
  }

  function archive() {
    archiveRoutine(routine)
    useToastStore.getState().push({ message: 'Routine archived.' })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '14px 0', borderTop: '1px dashed var(--line-dashed)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
        <span
          onClick={toggle}
          style={{
            width: 18,
            height: 18,
            border: '1.5px solid var(--line-solid)',
            borderRadius: 5,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: 'none',
            fontSize: 11,
            fontWeight: 700,
            background: doneToday ? 'var(--text-primary)' : 'transparent',
            borderColor: doneToday ? 'var(--text-primary)' : 'var(--line-solid)',
            color: 'var(--bg-app)',
          }}
        >
          {doneToday ? '✓' : ''}
        </span>
        <span style={{ fontSize: 14.5, color: doneToday ? 'var(--ink-hairline)' : 'var(--text-primary)', textDecoration: doneToday ? 'line-through' : 'none' }}>
          {routine.name}
        </span>
        {isChallenge && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--acc-gold)',
              background: 'color-mix(in oklch, var(--acc-gold-warm) 18%, var(--paper-parchment))',
              border: '1px solid var(--acc-gold-warm)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            {challengeProgress}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
        <History routine={routine} completions={completions} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--acc-terra)', fontWeight: 500, minWidth: 60, justifyContent: 'flex-end' }}>
          🔥 {current} <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>/ {best}</span>
        </span>
        <button type="button" onClick={archive} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
          archive
        </button>
      </div>
    </div>
  )
}

function AddRoutineForm() {
  const [name, setName] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [isChallenge, setIsChallenge] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  return (
    <div style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--line-card)', boxShadow: 'var(--shadow-card)', borderRadius: 'var(--radius-sharp)', padding: '14px 16px', transform: 'rotate(-0.3deg)', marginBottom: 28 }}>
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: 20,
          width: 48,
          height: 13,
          background: 'rgba(122,148,110,0.38)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
          transform: 'rotate(-2deg)',
          borderRadius: 1,
        }}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          if (isChallenge && start && end) {
            createChallenge(name.trim(), timeOfDay, { weekdays: [0, 1, 2, 3, 4, 5, 6] }, start, end)
            useToastStore.getState().push({ message: 'New challenge registered in the soil.' })
          } else {
            createRoutine(name.trim(), timeOfDay)
            useToastStore.getState().push({ message: 'New routine registered in the soil.' })
          }
          setName('')
          setStart('')
          setEnd('')
        }}
        style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Quick add routine…"
          style={{ flex: 1, minWidth: 200, fontFamily: 'var(--font-ui)', fontSize: 13.5, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 12px', outline: 'none', color: 'var(--text-primary)' }}
        />
        <select
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)' }}
        >
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
          <option value="evening">Evening</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={isChallenge} onChange={(e) => setIsChallenge(e.target.checked)} style={{ cursor: 'pointer' }} />
          Challenge
        </label>
        {isChallenge && (
          <>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 12, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '7px 8px', color: 'var(--text-primary)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>to</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 12, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '7px 8px', color: 'var(--text-primary)' }}
            />
          </>
        )}
        <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}>
          Add
        </button>
      </form>
    </div>
  )
}

export function RoutinesPage() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const active = routines.filter((r) => r.active)
  const todayKey = localDateKey(new Date())
  const doneToday = active.filter((r) => completions.some((c) => c.routine_id === r.id && c.completed_on === todayKey)).length

  const longestStreak = Math.max(
    0,
    ...active.map((r) => computeStreak(completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on), r.cadence).current),
  )
  const vine = vineAsset(longestStreak)

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Routines · the streak vine
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Routines</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', transform: 'rotate(-1deg)' }}>
          <img src={`assets/vine/${vine}.png`} alt="Vine" style={{ height: 96, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
          <span
            style={{
              position: 'absolute',
              top: -8,
              left: 24,
              width: 58,
              height: 14,
              background: 'var(--acc-gold-warm)',
              opacity: 0.35,
              backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.25) 0 3px, transparent 3px 6px)',
              transform: 'rotate(-1.5deg)',
              borderRadius: 1,
            }}
          />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>leaves grow along the streak</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          {doneToday}/{active.length} completed today
        </span>
      </div>

      <AddRoutineForm />

      <div style={{ maxWidth: 720 }}>
        {SECTIONS.map((section) => {
          const items = active.filter((r) => r.time_of_day === section.key)
          return (
            <div key={section.key} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
                <span>{section.label}</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              </div>
              {items.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: 'var(--text-tertiary)', fontSize: 13.5, padding: '8px 0', margin: 0 }}>Nothing scheduled here.</p>
              ) : (
                items.map((r) => <RoutineRow key={r.id} routine={r} completions={completions} />)
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
