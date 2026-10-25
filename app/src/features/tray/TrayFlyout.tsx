import { Suspense, lazy, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { Root } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClientRestore } from '@tanstack/query-persist-client-core'
import { queryClient, idbPersister } from '../../lib/queryClient'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { useAppZoneFromSettings } from '../../lib/settings'
import { useTasks, completeTaskWithUndo } from '../tasks/api'
import { todayListTasks } from '../tasks/grouping'
import { useCalendarEvents } from '../calendar/api'
import { blockHue } from '../calendar/blockHue'
import { timeText } from '../calendar/eventTime'
import { useProjects } from '../projects/api'
import { useRoutines } from '../routines/api'
import { usePendingInboxItems } from '../inbox/api'
import { useDomains } from '../domains/api'
import { useStarEvents } from '../today/api'
import { legacyGoalId } from '../today/goalStore'
import { useMinuteNow } from '../today/useMinuteNow'
import { dayTop3 } from '../today/top3Order'
import { dayOfJourney } from '../today/todayLayout'
import { Checkbox } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { ToastHost } from '../../components/ToastHost'
import { inRound, mmss, useFocusMirror } from './focusMirror'
import { focusTarget, minutesText, trayNow, type TrayNow } from './trayState'
import { native } from './native'
import { appZone, useAppZone } from '../../lib/appZone'
import type { CalendarEvent, Domain, Project, Task } from '../../lib/types'

const VoiceCaptureSheet = lazy(() => import('../capture/VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))
// The capture line's reader (chrono and the quick-add rules) — the heaviest part, loaded when it's used.
const reader = () => Promise.all([import('../command-bar/parseCommand'), import('../command-bar/quickAdd')])

// Popover B (Calendar extras options.html §5, "Today in a glance"; Kai's pick): a 340 × 460 borderless
// window above the K (src-tauri tray.rs) on tray.html. The date and Day N, the Now card (§4, card A) or
// the running focus round, the Top 3 with the goal's gold star, a capture line, focus, Open and Settings.
// The focus timer lives in the main window and is mirrored here (./focusMirror). Writes go through the
// outbox, as everywhere; the read cache is the app's own, restored from IndexedDB (read, never written
// from here, so the main window's fuller copy isn't thinned to what this window reads).

/** tray.html without ?menu (./entry): the app's cached day first, then the account. */
export async function mountPopover(root: Root): Promise<void> {
  try {
    await persistQueryClientRestore({ queryClient, persister: idbPersister })
  } catch {
    /* no cache yet: it loads */
  }
  root.render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Popover />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function Popover() {
  const { session, loading } = useAuth()
  // Shown again (it's hidden, not closed): what changed meanwhile, in the main window or elsewhere.
  useEffect(() => {
    const fresh = () => void queryClient.refetchQueries({ type: 'active', stale: true })
    window.addEventListener('focus', fresh)
    return () => window.removeEventListener('focus', fresh)
  }, [])
  if (loading) return null
  return session ? <SignedIn /> : <SignedOut />
}

function SignedIn() {
  useAppZoneFromSettings()
  return <TrayFlyout />
}

/** Esc hides the window (a click away is its blur, tray.rs). */
function useEscHides(on: boolean): void {
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void native('tray_hide')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
}

const open = (route?: string) => void native('tray_open', { route: route ?? null })

function dateLine(now: Date): string {
  return now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: appZone() }).replace(/^(\w+)/, '$1,')
}

const OpenGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" />
  </svg>
)

/** The app is genuinely signed out (this window shares its session, so it's the app's state too). */
function SignedOut() {
  const now = useMinuteNow()
  useEscHides(true)
  return (
    <div className="kf-tray">
      <header className="kf-tray-head">
        <span className="kf-tray-date">{dateLine(now)}</span>
      </header>
      <div className="kf-tray-out">
        <span className="kf-tray-k" aria-hidden="true">K</span>
        <p className="kf-tray-out-title">Sign in in Kai’s Flow</p>
        <p className="kf-tray-out-text">Your day shows here once you’re signed in.</p>
        <button type="button" className="kf-tray-btn is-cta" onClick={() => open()}>
          Open Kai’s Flow
          <OpenGlyph />
        </button>
      </div>
    </div>
  )
}

/** The block's accent, as the calendar draws it (its colour, else its project's or domain's). */
function hueOf(e: CalendarEvent, task: Task | undefined, projects: Project[], domains: Domain[]): CSSProperties {
  const project = projects.find((p) => p.id === (task?.project_id ?? e.project_id))
  const color = e.color ?? project?.color ?? (project && domains.find((d) => d.id === project.domain_id)?.color) ?? null
  const h = color ? blockHue(color) : e.task_id ? { c: 'var(--acc-lavender)', ink: 'var(--acc-lavender-text)' } : { c: 'var(--acc-blossom)', ink: 'var(--acc-blossom-text)' }
  return { '--c': h.c, '--ct': h.ink } as CSSProperties
}

/** §4 card A: Up next / Ongoing, the block's mark (its check for a task, a ring for an event), a bar, the times. */
function NowCard({ n, taskById, projects, domains }: { n: TrayNow<CalendarEvent>; taskById: Map<string, Task>; projects: Project[]; domains: Domain[] }) {
  if (n.kind === 'none') return <div className="kf-tray-quiet">Nothing else today</div>
  const e = n.event
  const task = e.task_id ? taskById.get(e.task_id) : undefined
  const mark = task ? <Checkbox checked={false} label={task.title} size={16} onChange={(on) => on && completeTaskWithUndo(task)} /> : <span className="kf-tray-ring-mark" aria-hidden="true" />
  if (n.kind === 'far')
    return (
      <div className="kf-tray-quiet" style={hueOf(e, task, projects, domains)}>
        Next ·{mark}
        <bdi dir="auto" className="kf-tray-quiet-t">{e.title}</bdi>
        <span className="kf-tray-quiet-tm">· {timeText(new Date(e.starts_at))}</span>
      </div>
    )
  const label = n.kind === 'on' ? `Ongoing${n.others ? ` · ${n.others + 1}` : ''}` : 'Up next'
  const countdown = n.kind === 'on' ? `${minutesText(n.leftMin)} left` : `in ${minutesText(n.inMin)}`
  return (
    <div className="kf-tray-now kf-tray-nc" style={hueOf(e, task, projects, domains)}>
      <div className="kf-tray-nc-h">
        {label}
        <span className="kf-tray-nc-cd">{countdown}</span>
      </div>
      <div className="kf-tray-nc-t">
        {mark}
        <bdi dir="auto" className="kf-tray-title">{e.title}</bdi>
      </div>
      <div className="kf-tray-nc-bar">
        <i style={{ width: `${n.kind === 'on' ? n.pct : 0}%` }} />
      </div>
      <div className="kf-tray-nc-tms">
        <span>{timeText(new Date(e.starts_at))}</span>
        <span>{timeText(new Date(e.ends_at))}</span>
      </div>
    </div>
  )
}

export function TrayFlyout() {
  const now = useMinuteNow()
  useAppZone() // re-render on the user's zone (it arrives with their settings)
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: routines = [] } = useRoutines()
  const { data: inbox = [] } = usePendingInboxItems()
  const [focus, sendFocus] = useFocusMirror()
  const [text, setText] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  useEscHides(!voiceOpen) // the voice sheet's own Esc closes it first

  // Today's Top 3 in its order, goal first, finished picks included (Today's own rule, ../today/top3Order).
  const visible = todayListTasks(tasks, now)
  const { data: starEvents = [] } = useStarEvents(visible.filter((t) => t.completed_at || t.top3).map((t) => t.id))
  const top3 = dayTop3(tasks, legacyGoalId(), starEvents, now)
  const goalId = top3[0]?.id ?? null
  const day = dayOfJourney(
    [...tasks.map((t) => t.created_at), ...inbox.map((i) => i.created_at), ...projects.map((p) => p.created_at), ...routines.map((r) => r.created_at)].sort()[0] ?? null,
    now,
  )
  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const nowCard = trayNow(events, (id) => taskById.get(id)?.status === 'done', now)

  const running = inRound(focus)
  const focusTask = focus?.taskId ? taskById.get(focus.taskId) : undefined
  const onBreak = focus?.mode === 'break' || focus?.mode === 'garden'
  const done = focus && !onBreak ? 1 - focus.secondsLeft / Math.max(1, focus.roundMin * 60) : 0

  function startFocus() {
    const target = focusTarget(tasks, null, goalId)
    sendFocus({ type: 'start', task: target && { id: target.id, project_id: target.project_id } })
  }

  async function capture(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    // P7e A21: the bar's own rule — read here at once (dates on the user's clock, #project, *labels,
    // !, 30m, every …, //, a link), a typed time makes a block, a plain line goes to the Inbox, and
    // the AI fills the rest after.
    const [{ parseCommand }, { captureTyped }] = await reader()
    captureTyped(parseCommand(t, domains, projects, { zone: 'cairo' }), t)
  }

  return (
    <div className="kf-tray">
      <header className="kf-tray-head">
        <span className="kf-tray-date">{dateLine(now)}</span>
        <span className="kf-tray-meta">Day {day}</span>
      </header>

      {running ? (
        <div className="kf-tray-now kf-tray-fb">
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
      ) : (
        <NowCard n={nowCard} taskById={taskById} projects={projects} domains={domains} />
      )}

      <div className="kf-tray-label">Top 3</div>
      <div className="kf-tray-rows">
        {top3.length === 0 && <div className="kf-tray-empty">No Top 3 yet — pick them when you plan the day.</div>}
        {top3.map((t) => (
          <div key={t.id} className={`kf-tray-row${t.completed_at ? ' is-done' : ''}`}>
            <Checkbox checked={!!t.completed_at} label={t.title} size={18} onChange={(on) => on && completeTaskWithUndo(t)} disabled={!!t.completed_at} />
            <button type="button" className="kf-tray-row-title" onClick={() => open(`/tasks?focus=${t.id}`)}>
              {t.title}
            </button>
            {t.id === goalId && (
              <span className="kf-tray-star" title="Goal of the day">
                <Icon name="star" size={16} fill="currentColor" />
              </span>
            )}
          </div>
        ))}
      </div>

      <form className="kf-tray-capture" onSubmit={(e) => void capture(e)}>
        <input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => void reader().catch(() => {})} placeholder="Write it down…" aria-label="Quick capture" />
        <button type="button" aria-label="Voice capture" onClick={() => setVoiceOpen(true)}>
          <Icon name="mic" size={18} />
        </button>
      </form>

      <div className="kf-tray-focus">
        {running ? (
          <>
            <button type="button" className="kf-tray-btn" onClick={() => sendFocus({ type: 'toggle' })}>
              {focus!.isRunning ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className="kf-tray-btn" onClick={() => sendFocus({ type: 'stop' })}>
              <Icon name="stop" size={14} />
              Stop
            </button>
          </>
        ) : (
          <button type="button" className="kf-tray-btn is-cta" onClick={startFocus}>
            <Icon name="focus-ring" size={16} />
            Start focus · {focus?.roundMin ?? 25}:00
          </button>
        )}
      </div>

      <footer className="kf-tray-foot">
        <button type="button" className="kf-tray-open" onClick={() => open()}>
          Open Kai’s Flow
          <OpenGlyph />
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
