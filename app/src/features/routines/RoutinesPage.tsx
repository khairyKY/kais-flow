import { useState } from 'react'
import {
  useRoutines,
  useRoutineCompletions,
  createRoutine,
  createChallenge,
  archiveRoutine,
  toggleCompletion,
} from './api'
import { aggregateCompletionRate, computeStreak, dailyCompletionRatios, localDateKey, streakRiskMessage } from './streaks'
import { groupRoutinesByTime, NAMED_TIMES, type NamedTime } from './routineGrouping'
import { useToastStore } from '../../lib/toastStore'
import { Select } from '../../components/Select'
import type { Routine, RoutineCompletion } from '../../lib/types'

const HISTORY_DAYS = 14

type TimeMode = NamedTime | 'clock' | 'custom' | 'none'

function vineDayState(done: number, scheduled: number): 'bare' | 'sprouting' | 'flowering' | 'lush' {
  if (scheduled === 0 || done === 0) return 'bare'
  const ratio = done / scheduled
  if (ratio < 0.5) return 'sprouting'
  if (ratio < 1) return 'flowering'
  return 'lush'
}

/** The page-header "streak vine" — a horizontal row of the last 7 days, per Kai's audit item 5
 * ("I want the vine to be horizontal ... and resemble the streak"). Each cell reuses the same 4
 * fixed vine PNGs, picked per-day by how much of that day's scheduled routines got done. Growth/
 * flame choreography is deliberately deferred to the Motion Retrofit — this is layout only. */
function StreakVine({ routines, completions }: { routines: Routine[]; completions: RoutineCompletion[] }) {
  const today = new Date()
  const cells = []
  for (let n = 6; n >= 0; n--) {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    const key = localDateKey(d)
    const scheduled = routines.filter((r) => r.cadence.weekdays.includes(d.getDay()))
    const done = scheduled.filter((r) => completions.some((c) => c.routine_id === r.id && c.completed_on === key))
    cells.push({ key, label: d.toLocaleDateString('en-US', { weekday: 'narrow' }), state: vineDayState(done.length, scheduled.length), isToday: n === 0 })
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      {cells.map((c) => (
        <div
          key={c.key}
          title={c.key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '6px 4px',
            borderRadius: 4,
            background: c.isToday ? 'color-mix(in oklch, var(--acc-gold-warm) 12%, transparent)' : 'transparent',
            border: c.isToday ? '1px dashed var(--acc-gold-warm)' : '1px solid transparent',
          }}
        >
          <img src={`assets/vine/${c.state}.png`} alt="" style={{ width: 28, height: 28, objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: c.isToday ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A simple polyline sparkline over the last `HISTORY_DAYS` of aggregate completion — per the
 * phase's own "keep the SVG simple" guidance, just a `<polyline>`, no chart library. */
function Sparkline({ ratios }: { ratios: number[] }) {
  const w = 90
  const h = 20
  const points = ratios
    .map((r, i) => `${((i / (ratios.length - 1)) * w).toFixed(1)},${(h - r * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flex: 'none' }}>
      <polyline points={points} fill="none" stroke="var(--acc-sage)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Real 7/30-day completion rates + a 14-day sparkline + a streak-risk nudge — all computed
 * from `routine_completions`, replacing what used to be a hardcoded 82%/78% (P4/P5.5 debt). */
function RateSummary({ routines, completions }: { routines: Routine[]; completions: RoutineCompletion[] }) {
  const rate7 = aggregateCompletionRate(routines, completions, 7)
  const rate30 = aggregateCompletionRate(routines, completions, 30)
  const ratios = dailyCompletionRatios(routines, completions, HISTORY_DAYS)
  const risk = streakRiskMessage(routines, completions)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        7D <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-semibold)' }}>{rate7}%</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        30D <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-semibold)' }}>{rate30}%</span>
      </span>
      <Sparkline ratios={ratios} />
      {risk && <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--acc-terra)' }}>{risk}</span>}
    </div>
  )
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
        {(routine.clock_time || (routine.time_of_day && !NAMED_TIMES.includes(routine.time_of_day as NamedTime))) && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', padding: '2px 8px' }}>
            {routine.clock_time ?? routine.time_of_day}
          </span>
        )}
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

/** Resolves the form's time picker into the two columns `createRoutine`/`createChallenge` write. */
function resolveTime(mode: TimeMode, customLabel: string, clockTime: string): { timeOfDay: string | null; clockTime: string | null } {
  if (mode === 'morning' || mode === 'afternoon' || mode === 'evening') return { timeOfDay: mode, clockTime: null }
  if (mode === 'clock') return { timeOfDay: null, clockTime: clockTime || null }
  if (mode === 'custom') return { timeOfDay: customLabel.trim() || null, clockTime: null }
  return { timeOfDay: null, clockTime: null }
}

function AddRoutineForm() {
  const [name, setName] = useState('')
  const [timeMode, setTimeMode] = useState<TimeMode>('morning')
  const [customLabel, setCustomLabel] = useState('')
  const [clockTime, setClockTime] = useState('')
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
          const { timeOfDay, clockTime: resolvedClock } = resolveTime(timeMode, customLabel, clockTime)
          if (isChallenge && start && end) {
            createChallenge(name.trim(), timeOfDay, { weekdays: [0, 1, 2, 3, 4, 5, 6] }, start, end, resolvedClock)
            useToastStore.getState().push({ message: 'New challenge registered in the soil.' })
          } else {
            createRoutine(name.trim(), timeOfDay, undefined, resolvedClock)
            useToastStore.getState().push({ message: 'New routine registered in the soil.' })
          }
          setName('')
          setCustomLabel('')
          setClockTime('')
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
        <Select
          value={timeMode}
          onChange={(v) => setTimeMode(v as TimeMode)}
          ariaLabel="Routine time"
          style={{ fontSize: 12.5, padding: '8px 10px' }}
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
            { value: 'clock', label: 'Pick a time…' },
            { value: 'custom', label: 'Custom label…' },
            { value: 'none', label: 'No time' },
          ]}
        />
        {timeMode === 'clock' && (
          <input
            type="time"
            value={clockTime}
            onChange={(e) => setClockTime(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 12.5, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '7px 8px', color: 'var(--text-primary)' }}
          />
        )}
        {timeMode === 'custom' && (
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="e.g. dusk"
            style={{ width: 100, fontFamily: 'var(--font-ui)', fontSize: 12.5, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '7px 8px', outline: 'none', color: 'var(--text-primary)' }}
          />
        )}
        <span
          role="checkbox"
          aria-checked={isChallenge}
          tabIndex={0}
          onClick={() => setIsChallenge((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsChallenge((v) => !v) } }}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            border: '1.5px solid var(--line-solid)',
            background: isChallenge ? 'var(--text-primary)' : 'transparent',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          {isChallenge && <span style={{ color: 'var(--bg-app)', fontSize: 10, lineHeight: 1 }}>✓</span>}
        </span>
        <label
          onClick={() => setIsChallenge((v) => !v)}
          style={{ fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}
        >
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

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Routines · the streak vine
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Routines</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StreakVine routines={active} completions={completions} />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--text-secondary)', transform: 'rotate(-0.6deg)' }}>this week's growth</span>
        </div>
      </div>

      <RateSummary routines={active} completions={completions} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          {doneToday}/{active.length} completed today
        </span>
      </div>

      <AddRoutineForm />

      <div style={{ maxWidth: 720 }}>
        {groupRoutinesByTime(active).map((section) => (
          <div key={section.key} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
              <span>{section.label}</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
            </div>
            {section.items.length === 0 ? (
              <p style={{ fontStyle: 'italic', color: 'var(--text-tertiary)', fontSize: 13.5, padding: '8px 0', margin: 0 }}>Nothing scheduled here.</p>
            ) : (
              section.items.map((r) => <RoutineRow key={r.id} routine={r} completions={completions} />)
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
