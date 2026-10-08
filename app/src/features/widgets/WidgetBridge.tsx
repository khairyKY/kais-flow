import { Suspense, lazy, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useTasks } from '../tasks/api'
import { todayListTasks } from '../tasks/grouping'
import { useCalendarEvents } from '../calendar/api'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { usePendingInboxItems } from '../inbox/api'
import { useSlipping } from '../slipping/api'
import { useResurfacePick } from '../resurfacing/api'
import { useJournalEntries } from '../journal/api'
import { isWritten } from '../journal/journalDay'
import { useRitualStepsToday } from '../rituals/api'
import { useRitualPins } from '../rituals/ritualPins'
import { useFocusStore } from '../focus/focusStore'
import { useStarEvents } from '../today/api'
import { legacyGoalId } from '../today/goalStore'
import { dayTop3 } from '../today/top3Order'
import { dayOfJourney } from '../today/todayLayout'
import { useDay } from '../today/useDay'
import { runNotificationAction, actionFromSearch } from '../notifications/actions'
import { useCairoWeather } from '../../lib/seasons'
import { useOnline } from '../../lib/useOnline'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { appZone, useAppZone } from '../../lib/appZone'
import { buildSnapshot } from './snapshot'
import { appWrites, takeQueue, useHideTitles, useWidgetVoice } from './bridge'
import { applyOps } from './queue'
import { pushSnapshot } from './native'

const VoiceCaptureSheet = lazy(() => import('../capture/VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

/** Widget taps that stay on the page you're on (a sheet over it). */
const IN_PLACE = new Set(['capture', 'voice', 'paper', 'ask'])
/** Pushed at least this often while the app runs, so a widget's "fresh at" stays honest. */
const KEEPALIVE_MS = 15 * 60_000

/**
 * The Android app's widgets, mounted once in the shell (AppLayout, Capacitor only). Builds the
 * snapshot from the same reads Today uses and writes it whenever it changes (debounced), on
 * resume and at the minute the day rolls over (useDay's minute clock); takes the ticks made on
 * the home screen; runs widget taps (MainActivity.openFromWidget → window.__kfWidgetOpen).
 */
export function WidgetBridge(): React.ReactNode {
  const navigate = useNavigate()
  useAppZone()
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: inbox = [] } = usePendingInboxItems()
  const { data: slipping = [] } = useSlipping()
  const { data: journal = [] } = useJournalEntries()
  const { data: weather } = useCairoWeather()
  const { data: ritualSteps = { morning: new Set<string>(), evening: new Set<string>() } } = useRitualStepsToday()
  const ritualPins = useRitualPins()
  const resurface = useResurfacePick()
  const online = useOnline()
  const hideTitles = useHideTitles((s) => s.on)
  const voiceOpen = useWidgetVoice((s) => s.open)
  // The timer's every-second tick is read at build time, not subscribed to (no re-render a second).
  const focusMode = useFocusStore((s) => s.mode)
  const focusRunning = useFocusStore((s) => s.isRunning)
  const focusTaskId = useFocusStore((s) => s.activeTask?.id ?? null)
  const roundMin = useFocusStore((s) => s.settings.focusRoundMin)
  const inRound = useFocusStore((s) => s.mode === 'pomodoro' && s.secondsLeft < s.settings.focusRoundMin * 60)

  const visible = todayListTasks(tasks)
  const { data: starEvents = [] } = useStarEvents(visible.filter((t) => t.completed_at || t.top3).map((t) => t.id))
  const top3 = dayTop3(tasks, legacyGoalId(), starEvents, new Date())
  const day = useDay({ events, tasks, top3, ritualSteps, prompts: ritualPins })
  const now = day.now

  const today = cairoDateKey(now)
  const line = journal.filter((e) => e.entry_date === today && !e.deleted_at && isWritten(e)).at(-1)?.body.split('\n')[0] ?? null
  const archived = projects.filter((p) => p.status === 'archived').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  const firstRecord = [...tasks.map((t) => t.created_at), ...inbox.map((i) => i.created_at), ...projects.map((p) => p.created_at), ...routines.map((r) => r.created_at)].sort()[0] ?? null

  const focus = useFocusStore.getState()
  const snapshot = buildSnapshot({
    now,
    clock: Date.now(),
    zone: appZone(),
    online,
    hideTitles,
    tasks,
    events,
    projects,
    domains,
    top3,
    dayN: dayOfJourney(firstRecord, now),
    phase: day.state.phase,
    focus: { mode: focusMode, isRunning: focusRunning, secondsLeft: focus.secondsLeft, roundMin, taskId: focusTaskId },
    routines,
    completions,
    inbox: inbox.length,
    slipping,
    journalLine: line,
    resurface: resurface
      ? resurface.task
        ? { title: resurface.task.title, createdAt: resurface.task.created_at, source: 'task', route: `/today?task=${resurface.task.id}` }
        : { title: resurface.item?.raw_text ?? '', createdAt: resurface.item?.created_at ?? resurface.row.created_at, source: 'inbox', route: '/inbox' }
      : null,
    specimen: archived ? { title: archived.name, at: archived.updated_at } : null,
    weather: weather ?? null,
  })
  void inRound // re-render when a paused round starts or ends

  // Push on change (debounced), and at least every KEEPALIVE_MS. The key ignores the write time and
  // the few seconds a running round's end drifts between builds.
  const key = JSON.stringify({ ...snapshot, at: 0, focus: { ...snapshot.focus, endsAt: Math.round(snapshot.focus.endsAt / 5000) } })
  const pushed = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const latest = useRef(snapshot)
  latest.current = snapshot
  useEffect(() => {
    if (key === pushed.current.key && Date.now() - pushed.current.at < KEEPALIVE_MS) return
    const id = window.setTimeout(() => {
      pushSnapshot(latest.current)
      pushed.current = { key, at: Date.now() }
    }, 800)
    return () => window.clearTimeout(id)
  }, [key, now])

  useEffect(() => {
    const w = window as unknown as { __kfWidgetQueue?: () => void; __kfWidgetOpen?: (path: string) => boolean }
    const writes = appWrites((ids) => void runNotificationAction({ action: 'done', taskIds: ids }, navigate))
    const drain = () => {
      const ops = takeQueue()
      if (ops.length === 0) return
      applyOps(ops, writes)
      pushed.current = { key: '', at: 0 } // the next build pushes, ticks applied
    }
    drain()
    w.__kfWidgetQueue = drain
    w.__kfWidgetOpen = (path) => {
      const url = new URL(path, location.origin)
      const action = actionFromSearch(url.search)
      url.searchParams.delete('kfAction')
      url.searchParams.delete('kfTasks')
      url.searchParams.delete('kfText')
      if (!action) navigate(url.pathname + url.search)
      else {
        if (!IN_PLACE.has(action.action)) navigate(url.pathname + url.search)
        void runNotificationAction(action, navigate)
      }
      return true
    }
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      drain()
      pushed.current = { ...pushed.current, at: 0 } // resumed: write the day again
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      delete w.__kfWidgetQueue
      delete w.__kfWidgetOpen
    }
  }, [navigate])

  return voiceOpen ? (
    <Suspense fallback={null}>
      <VoiceCaptureSheet open onClose={() => useWidgetVoice.setState({ open: false })} />
    </Suspense>
  ) : null
}
