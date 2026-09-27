import { Link } from 'react-router'
import { useFocusStore } from './focusStore'
import type { Task } from '../../lib/types'

// R4-D3 (Kai's 2026-07-20 ruling): "a mini version of the focus feature so that the user can
// stay focused on that task … with a tiny pomodoro next to them." Shares the one session in
// focusStore, so starting here and opening /focus shows the same running clock, and vice versa.

function mmss(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MiniFocus({ task }: { task: Task }) {
  const { mode, isRunning, secondsLeft, stopwatchSeconds, currentRound, settings, activeTask, togglePlay, setActiveTask } =
    useFocusStore()
  const isThisTask = activeTask?.id === task.id

  function start() {
    if (!isThisTask) setActiveTask({ id: task.id, project_id: task.project_id })
    if (!isRunning) togglePlay()
  }

  const label = mode === 'break' ? 'Break' : mode === 'stopwatch' ? 'Stopwatch' : 'Focus'

  return (
    <div style={{ border: '1px solid var(--line-card)', borderRadius: 8, padding: '13px 14px', background: 'var(--paper-bone)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {label}
        </span>
        <Link
          to="/focus"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', textDecoration: 'none' }}
        >
          full view →
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 27,
            fontWeight: 600,
            lineHeight: 1,
            // A session running on a *different* task shouldn't look like it's timing this one.
            color: isThisTask || !activeTask ? 'var(--ink-body)' : 'var(--ink-hairline)',
          }}
        >
          {mmss(mode === 'stopwatch' ? stopwatchSeconds : secondsLeft)}
        </span>
        <button
          type="button"
          onClick={isThisTask && isRunning ? togglePlay : start}
          style={{
            minWidth: 76,
            minHeight: 34,
            borderRadius: 999,
            border: '1px solid var(--line-card)',
            background: isThisTask && isRunning ? 'var(--paper-parchment)' : 'var(--acc-terra)',
            color: isThisTask && isRunning ? 'var(--ink-body)' : 'var(--paper-parchment)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {isThisTask && isRunning ? 'Pause' : 'Focus'}
        </button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 8 }}>
        round {currentRound} of {settings.roundsBeforeLongBreak}
        {activeTask && !isThisTask && ' · running on another task'}
      </div>
    </div>
  )
}
