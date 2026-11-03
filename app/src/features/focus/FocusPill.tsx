import { useLocation, useNavigate } from 'react-router'
import { useTasks } from '../tasks/api'
import { mmss } from '../tray/focusMirror'
import { checkOffFocus } from './checkOff'
import { FocusTimeline } from './FocusTimeline'
import { phaseOf, timelineOf } from './focusPlan'
import { useFocusStore } from './focusStore'
import './focusPill.css'

// Focus D3 (C's pill): while a round is under way it follows you to the other pages — the time, the task, the
// block's segments (no flowers), pause and done. Tap → back to Focus. Settings → "Focus pill on other pages".
export function FocusPill() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const f = useFocusStore()
  const { data: tasks = [] } = useTasks()
  const phase = phaseOf(f, f.settings)
  const under = phase === 'running' || phase === 'paused' || phase === 'break' || phase === 'end'
  if (!f.settings.pill || pathname === '/focus' || f.mode === 'stopwatch' || f.mode === 'garden' || !under) return null
  const task = f.activeTask ? tasks.find((t) => t.id === f.activeTask!.id && t.status === 'todo') : undefined
  const tl = timelineOf(f, f.settings)
  const onBreak = f.mode === 'break'
  return (
    <div className={`fpill${onBreak ? ' is-break' : ''}`} role="region" aria-label="Focus">
      <button type="button" className="fpill-open" onClick={() => navigate('/focus')} aria-label="Back to Focus">
        <b className="fpill-time">{onBreak ? `Break · ${mmss(f.secondsLeft)}` : mmss(f.secondsLeft)}</b>
        <span className="fpill-task">{onBreak ? 'The bud rests' : (task?.title ?? 'A round of focus')}</span>
        {tl && f.block && <FocusTimeline tl={tl} color={f.block.color} className="fpill-tl" />}
      </button>
      {!onBreak && (
        <button type="button" className="fpill-btn" aria-label={f.isRunning ? 'Pause' : 'Resume'} onClick={f.togglePlay}>
          {f.isRunning ? '❙❙' : '▶'}
        </button>
      )}
      {!onBreak && task && (
        <button type="button" className="fpill-btn is-cta" aria-label={`Done: ${task.title}`} onClick={() => checkOffFocus(task)}>
          ✓
        </button>
      )}
    </div>
  )
}
