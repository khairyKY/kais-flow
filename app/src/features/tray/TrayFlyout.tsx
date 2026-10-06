import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react'
import { useTasks, completeTaskWithUndo } from '../tasks/api'
import { todayListTasks } from '../tasks/grouping'
import { useCalendarEvents } from '../calendar/api'
import { cairoTimeKey } from '../calendar/eventTime'
import { useProjects } from '../projects/api'
import { useRoutines } from '../routines/api'
import { usePendingInboxItems } from '../inbox/api'
import { captureWithAI } from '../capture/api'
import { useStarEvents } from '../today/api'
import { useGoalStore } from '../today/goalStore'
import { useMinuteNow } from '../today/useMinuteNow'
import { starredIds, top3OfToday } from '../today/top3Today'
import { isInProgress, upNextEvents } from '../today/upNext'
import { dayOfJourney } from '../today/todayLayout'
import { Checkbox } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { ToastHost } from '../../components/ToastHost'
import { useFocusMirror } from './focusChannel'
import { focusTarget } from './trayState'
import { native } from './native'
import './tray.css'
import { appZone, useAppZone } from '../../lib/appZone'

const VoiceCaptureSheet = lazy(() => import('../capture/VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

// The tray flyout (Tray and Notifications.dc.html 12b day · nothing running, 12c focus running ·
// night): a 340 × 460 borderless window above the K (src-tauri tray.rs), on this route of the same
// app. The same reads as Today — the date and Day N, Now/Next, the Top 3 — a capture field, and
// the focus timer, which lives in the main window and is mirrored here (./focusChannel).

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TrayFlyout() {
  const now = useMinuteNow()
  useAppZone() // re-render on the user's zone (it arrives with their settings)
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: routines = [] } = useRoutines()
  const { data: inbox = [] } = usePendingInboxItems()
  const goalId = useGoalStore((s) => s.goalTaskId)
  const [focus, sendFocus] = useFocusMirror()
  const [text, setText] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)

  // Esc closes (click-away is the window's blur, tray.rs). The theme follows the main window's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !voiceOpen) void native('tray_hide')
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'kf_theme') document.documentElement.dataset.theme = e.newValue === 'night' ? 'night' : 'day'
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('storage', onStorage)
    }
  }, [voiceOpen])

  // Today's Top 3, goal first, finished picks included (Today's own rule, ../today/top3Today).
  const visible = todayListTasks(tasks, now)
  const { data: starEvents = [] } = useStarEvents(visible.filter((t) => t.completed_at).map((t) => t.id))
  const picks = top3OfToday(visible, starredIds(starEvents))
  const goal = picks.find((t) => t.id === goalId)
  const top3 = goal ? [goal, ...picks.filter((t) => t !== goal)] : picks
  const day = dayOfJourney(
    [...tasks.map((t) => t.created_at), ...inbox.map((i) => i.created_at), ...projects.map((p) => p.created_at), ...routines.map((r) => r.created_at)].sort()[0] ?? null,
    now,
  )
  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const next = upNextEvents(events, now).find((e) => !(e.task_id && taskById.get(e.task_id)?.status === 'done')) ?? null
  const nextTask = next?.task_id ? taskById.get(next.task_id) : undefined

  const inRound = !!focus && (focus.isRunning || (focus.mode === 'pomodoro' && focus.secondsLeft < focus.roundMin * 60))
  const focusTask = focus?.taskId ? taskById.get(focus.taskId) : undefined
  const onBreak = focus?.mode === 'break' || focus?.mode === 'garden'
  const done = focus && !onBreak ? 1 - focus.secondsLeft / Math.max(1, focus.roundMin * 60) : 0

  function startFocus() {
    const target = focusTarget(tasks, null, goalId)
    sendFocus({ type: 'start', task: target && { id: target.id, project_id: target.project_id } })
  }

  function capture(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    void captureWithAI(t)
  }

  const open = (route?: string) => void native('tray_open', { route: route ?? null })

  return (
    <div className="kf-tray">
      <header className="kf-tray-head">
        <span className="kf-tray-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: appZone() }).replace(/^(\w+)/, '$1,')}</span>
        <span className="kf-tray-meta">Day {day}</span>
      </header>

      {inRound ? (
        <div className="kf-tray-now">
          <span className="kf-tray-ring" style={{ background: `conic-gradient(var(--acc-sage-text) 0 ${Math.round(done * 100)}%, var(--line-card) 0 100%)` }}>
            <span>
              <Icon name="focus-ring" size={18} />
            </span>
          </span>
          <div className="kf-tray-now-text">
            <span className="kf-tray-meta" style={{ color: 'var(--acc-sage-text)' }}>
              {onBreak ? 'Break' : 'Focus'} · {mmss(focus!.secondsLeft)} left{focus!.isRunning ? '' : ' · paused'}
            </span>
            <div className="kf-tray-title">{onBreak ? 'Rest your eyes' : (focusTask?.title ?? 'A round of focus')}</div>
          </div>
        </div>
      ) : next ? (
        <div className="kf-tray-now">
          <div className="kf-tray-now-text">
            <span className="kf-tray-meta" style={{ color: 'var(--acc-lavender-deep)' }}>
              {isInProgress(next.starts_at, next.ends_at, now) ? 'Now' : `Next · ${cairoTimeKey(new Date(next.starts_at))}`}
            </span>
            <div className="kf-tray-title">{next.title}</div>
          </div>
          {nextTask && (
            <button type="button" className="kf-tray-check" aria-label={`Complete "${nextTask.title}"`} onClick={() => completeTaskWithUndo(nextTask)}>
              <Icon name="check" size={18} />
            </button>
          )}
        </div>
      ) : null}

      <div className="kf-tray-label">
        <span className="kf-tray-meta">Top 3</span>
      </div>
      <div className="kf-tray-rows">
        {top3.length === 0 && <div className="kf-tray-empty">No Top 3 yet — pick them when you plan the day.</div>}
        {top3.map((t) => (
          <div key={t.id} className={`kf-tray-row${t.completed_at ? ' is-done' : ''}`}>
            <Checkbox checked={!!t.completed_at} label={t.title} size={18} onChange={(on) => on && completeTaskWithUndo(t)} disabled={!!t.completed_at} />
            <button type="button" className="kf-tray-row-title" onClick={() => open(`/tasks?focus=${t.id}`)}>
              {t.title}
            </button>
            <span className="kf-tray-star" aria-hidden="true">
              <Icon name="star" size={18} fill="currentColor" />
            </span>
          </div>
        ))}
      </div>

      <form className="kf-tray-capture" onSubmit={capture}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write it down…" aria-label="Quick capture" />
        <button type="button" aria-label="Voice capture" onClick={() => setVoiceOpen(true)}>
          <Icon name="mic" size={18} />
        </button>
      </form>

      <div className="kf-tray-focus">
        {inRound ? (
          <>
            <button type="button" className="kf-tray-btn" onClick={() => sendFocus({ type: 'toggle' })}>
              {focus!.isRunning ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              )}
              {focus!.isRunning ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className="kf-tray-btn" onClick={() => sendFocus({ type: 'stop' })}>
              <Icon name="stop" size={16} />
              Stop
            </button>
          </>
        ) : (
          <button type="button" className="kf-tray-btn is-cta" onClick={startFocus}>
            <Icon name="focus-ring" size={18} />
            Start focus · {focus?.roundMin ?? 25}:00
          </button>
        )}
      </div>

      <footer className="kf-tray-foot">
        <button type="button" className="kf-tray-open" onClick={() => open()}>
          Open Kai’s Flow
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" /></svg>
        </button>
        <button type="button" className="kf-tray-icon" aria-label="Settings" onClick={() => open('/settings')}>
          <Icon name="settings" size={18} />
        </button>
      </footer>

      {voiceOpen && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet open onClose={() => setVoiceOpen(false)} />
        </Suspense>
      )}
      <ToastHost />
    </div>
  )
}
