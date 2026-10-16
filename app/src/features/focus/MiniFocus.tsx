import { Link } from 'react-router'
import { Button } from '../../components/kit'
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

  // Kai 2026-09-27 ("a bit gimmicky?"): the full pomodoro card sat at the top of every task page.
  // Idle, it's now one quiet pill; the card only appears while this task is the one being timed.
  if (!isThisTask) {
    const pill = { display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 32, padding: '0 13px', borderRadius: 999, border: '1px solid var(--line-card)', background: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', color: 'var(--ink-muted)', cursor: 'pointer', textDecoration: 'none' }
    return activeTask ? (
      <Link to="/focus" style={pill}>Focus running on another task →</Link>
    ) : (
      <button type="button" onClick={start} style={pill} aria-label={`Start a focus session on ${task.title}`}>
        <span aria-hidden="true" style={{ color: 'var(--acc-terra)' }}>▶</span> Focus · {mmss(mode === 'stopwatch' ? stopwatchSeconds : secondsLeft)}
      </button>
    )
  }

  return (
    <div style={{ border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', padding: '13px 14px', background: 'var(--paper-bone)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
          {label}
        </span>
        <Link
          to="/focus"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)', textDecoration: 'none' }}
        >
          Full view →
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
            color: isThisTask || !activeTask ? 'var(--ink-body)' : 'var(--ink-faint)',
          }}
        >
          {mmss(mode === 'stopwatch' ? stopwatchSeconds : secondsLeft)}
        </span>
        {/* B D11: the kit button — terra to start, bone to pause. */}
        <Button type="button" variant={isThisTask && isRunning ? 'secondary' : 'cta'} onClick={isThisTask && isRunning ? togglePlay : start}>
          {isThisTask && isRunning ? 'Pause' : 'Focus'}
        </Button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 8 }}>
        Round {currentRound} of {settings.roundsBeforeLongBreak}
        {activeTask && !isThisTask && ' · running on another task'}
      </div>
    </div>
  )
}
