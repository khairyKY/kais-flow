import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { create } from 'zustand'
import { deliver, focusDoneNotice, inQuietHours, isPaused, type NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'
import { useSyncStatus } from '../../components/syncQueue'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { useFocusStore } from '../focus/focusStore'
import { legacyGoalId } from '../today/goalStore'
import { goalIdOf } from '../today/top3Order'
import { cachedStarEvents } from '../today/api'
import { useMinuteNow } from '../today/useMinuteNow'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { useProjects } from '../projects/api'
import { installNotificationActions } from '../notifications/actions'
import { lookingHere, showLocal } from '../notifications/local'
import { localPlan, type Planned } from '../notifications/plan'
import { isCapacitorShell } from '../../lib/platform'
import { applyFocusCommand, serveFocus } from './focusChannel'
import { isTauri, native, readTrayShown } from './native'
import { focusMenuLabel, focusTarget, pauseMenuLabel, trayIconState } from './trayState'
import type { AppSettings, Project, Task } from '../../lib/types'

// The app's half of the tray and of local notifications, mounted once in the main window's shell
// (AppLayout). Everywhere: notification buttons land here (actions.ts), a finished focus round
// says so when nobody is looking, and the flyout's focus mirror is served. In the Windows app also:
// the K's state and menu rows, the menu's actions (window.__kfTray), and the reminders and rituals
// while it runs. In the Android app: the OS's notification schedule (notifications/android.ts).

/** "Something needs you": a reminder fired here and nobody has looked since. */
const useNeedsYou = create<{ on: boolean }>(() => ({ on: false }))

const prefs = () => queryClient.getQueryData<AppSettings>(['app_settings']) as NoticePrefs | undefined

const REMINDED_KEY = 'kf_reminded'
function reminded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** What this device would notify in (from, to], from what it holds (notifications/plan.ts); null
 * while tasks haven't loaded yet. */
function planFor(from: Date, to: Date, now: Date): Planned[] | null {
  const tasks = queryClient.getQueryData<Task[]>(['tasks'])
  // Projects still loading: wait one sweep, so "09:50 · Car" doesn't go out as "09:50".
  if (!tasks || queryClient.getQueryState(['projects'])?.status === 'pending') return null
  const projects = queryClient.getQueryData<Project[]>(['projects']) ?? []
  return localPlan({ tasks, projects, prefs: prefs(), from, to, now, zone: appZone() })
}

/** The Windows app's own sweep (WebView2 has no Web Push): every 30s, the reminders and rituals
 * that came due. False while tasks haven't loaded yet — the window it covers waits for them. */
function sweepDue(from: Date, now: Date): boolean {
  const plan = planFor(from, now, now)
  if (!plan) return false
  const seen = reminded()
  const due = plan.filter((p) => !seen.includes(p.key))
  if (due.length === 0) return true
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify([...seen, ...due.map((p) => p.key)].slice(-100)))
  } catch {
    /* worst case one repeats after a restart */
  }
  if (due.some((p) => p.notice.kind === 'task_reminder')) useNeedsYou.setState({ on: true })
  for (const p of due) void showLocal(p.notice)
  return true
}

/** The Android app: hands the next few days to the OS (notifications/android.ts) — and, while a
 * focus round runs with the app in the background, its "minutes tended" at the round's end. */
const ANDROID_DAYS = 3
function scheduleOnAndroid(): void {
  const now = new Date()
  const plan = planFor(now, new Date(now.getTime() + ANDROID_DAYS * 86_400_000), now)
  if (!plan) return
  const f = useFocusStore.getState()
  if (document.visibilityState === 'hidden' && f.isRunning && f.mode === 'pomodoro') {
    const at = new Date(now.getTime() + f.secondsLeft * 1000)
    const task = f.activeTask ? queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === f.activeTask!.id)?.title ?? null : null
    const breakMin = f.currentRound >= f.settings.roundsBeforeLongBreak ? f.settings.longBreakMin : f.settings.shortBreakMin
    const notice = deliver(focusDoneNotice(f.settings.focusRoundMin, task, breakMin, prefs()), prefs(), at, appZone())
    if (notice) plan.push({ key: notice.tag, at, notice })
  }
  void import('../notifications/android').then((m) => m.scheduleAndroid(plan))
}

/** "25 minutes tended ✿" when a round runs out — unless someone is looking at the app. */
function watchFocusDone(): () => void {
  return useFocusStore.subscribe((s, prev) => {
    // Only tick() moves a running round at its last second into a break or the garden.
    if (!(prev.mode === 'pomodoro' && prev.isRunning && prev.secondsLeft <= 1 && s.mode !== 'pomodoro') || lookingHere()) return
    const task = prev.activeTask ? queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === prev.activeTask!.id)?.title ?? null : null
    const breakMin = s.breakType === 'long' ? s.settings.longBreakMin : s.settings.shortBreakMin
    const now = new Date()
    const notice = deliver(focusDoneNotice(prev.settings.focusRoundMin, task, breakMin, prefs()), prefs(), now, appZone())
    if (notice) void showLocal(notice)
  })
}

function startOrStopFocus(): void {
  const f = useFocusStore.getState()
  if (f.isRunning || (f.mode === 'pomodoro' && f.secondsLeft < f.settings.focusRoundMin * 60)) return applyFocusCommand({ type: 'stop' })
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const target = focusTarget(tasks, f.activeTask?.id ?? null, goalIdOf(tasks, legacyGoalId(), cachedStarEvents()))
  applyFocusCommand({ type: 'start', task: target && { id: target.id, project_id: target.project_id } })
}

function togglePause(): void {
  const until = prefs()?.notify_paused_until
  updateAppSetting('notify_paused_until', until && new Date(until).getTime() > Date.now() ? null : new Date(Date.now() + 3_600_000).toISOString())
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

/** Rendered once in the main window's shell. A component of its own, so the timer's every-second
 * tick re-renders only this, never the shell. */
export function TrayBridge(): null {
  const navigate = useNavigate()
  useProjects() // a notice names its task's project ("09:50 · Car"), whatever page is open
  useEffect(() => installNotificationActions(navigate), [navigate])
  useEffect(() => watchFocusDone(), [])
  useEffect(() => serveFocus(), [])

  // ── the Windows app only ──
  const tauri = isTauri()
  useEffect(() => {
    if (!tauri) return
    void native('tray_shown', { shown: readTrayShown() })
    const w = window as unknown as { __kfTray?: (arg: string | { open: string }) => void }
    w.__kfTray = (arg) => {
      if (typeof arg === 'object') return navigate(arg.open)
      if (arg === 'seen') useNeedsYou.setState({ on: false })
      else if (arg === 'capture') useCommandBarStore.getState().setOpen(true)
      else if (arg === 'focus') startOrStopFocus()
      else if (arg === 'pause') togglePause()
      else if (arg === 'settings') navigate('/settings')
    }
    const seen = () => useNeedsYou.setState({ on: false })
    window.addEventListener('focus', seen)
    let from = new Date(Date.now() - 10 * 60_000)
    const sweep = () => {
      const now = new Date()
      if (sweepDue(from, now)) from = now
    }
    sweep()
    const id = window.setInterval(sweep, 30_000)
    return () => {
      delete w.__kfTray
      window.removeEventListener('focus', seen)
      window.clearInterval(id)
    }
  }, [tauri, navigate])

  // ── the Android app only: keep the OS's schedule in step with the data ──
  const android = isCapacitorShell()
  useEffect(() => {
    if (!android) return
    void import('../notifications/android').then((m) => m.androidPermission(true)).then(scheduleOnAndroid) // Android 13+ asks once
    let timer = 0
    const soon = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(scheduleOnAndroid, 1500)
    }
    const watched = new Set(['tasks', 'projects', 'app_settings'])
    const offCache = queryClient.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && watched.has(String(e.query.queryKey[0]))) soon()
    })
    const offFocus = useFocusStore.subscribe((s, prev) => {
      if (s.isRunning !== prev.isRunning || s.mode !== prev.mode) soon()
    })
    // Straight away: going to the background is the moment a running round's end gets scheduled.
    document.addEventListener('visibilitychange', scheduleOnAndroid)
    return () => {
      window.clearTimeout(timer)
      offCache()
      offFocus()
      document.removeEventListener('visibilitychange', scheduleOnAndroid)
    }
  }, [android])

  const { data: settings } = useAppSettings()
  const now = useMinuteNow()
  const focus = {
    mode: useFocusStore((s) => s.mode),
    isRunning: useFocusStore((s) => s.isRunning),
    secondsLeft: useFocusStore((s) => s.secondsLeft),
    roundMin: useFocusStore((s) => s.settings.focusRoundMin),
  }
  // Kai 2026-10-07: the K flipped to its offline look for every write's second or two in flight. It
  // follows the topbar's calm status now — only a slow, offline or not-saved write changes it.
  const sync = useSyncStatus().view
  const state = trayIconState({
    focus,
    needsYou: useNeedsYou((s) => s.on),
    offline: sync.kind === 'offline',
    waiting: sync.kind === 'syncing' || sync.kind === 'parked' ? Math.max(1, sync.n) : 0,
    quiet: inQuietHours(settings, now, appZone()) || isPaused(settings, now),
  })
  const dark = useSystemDark()
  const focusLabel = focusMenuLabel(focus)
  const pauseLabel = pauseMenuLabel(settings?.notify_paused_until, now)
  useEffect(() => {
    if (tauri) void native('tray_set', { state, dark, focusLabel, pauseLabel })
  }, [tauri, state, dark, focusLabel, pauseLabel])
  return null
}
