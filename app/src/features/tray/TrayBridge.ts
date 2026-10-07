import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { create } from 'zustand'
import { deliver, focusDoneNotice, inQuietHours, isPaused, reminderNotice, type NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'
import { useSyncStatus } from '../../components/syncQueue'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { useFocusStore } from '../focus/focusStore'
import { useGoalStore } from '../today/goalStore'
import { useMinuteNow } from '../today/useMinuteNow'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { installNotificationActions } from '../notifications/actions'
import { lookingHere, showLocal } from '../notifications/local'
import { applyFocusCommand, serveFocus } from './focusChannel'
import { isTauri, native, readTrayShown } from './native'
import { dueReminders, focusMenuLabel, focusTarget, pauseMenuLabel, trayIconState } from './trayState'
import type { AppSettings, Project, Task } from '../../lib/types'

// The app's half of the tray and of local notifications, mounted once in the main window's shell
// (AppLayout). Everywhere: notification buttons land here (actions.ts), a finished focus round
// says so when nobody is looking, and the flyout's focus mirror is served. In the Windows app also:
// the K's state and menu rows, the menu's actions (window.__kfTray), and reminders while it runs.

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

/** The Windows app's own reminder sweep (WebView2 has no Web Push): every 30s, what came due.
 * False while tasks haven't loaded yet — the window it covers waits for them. */
function sweepReminders(from: Date, now: Date): boolean {
  const tasks = queryClient.getQueryData<Task[]>(['tasks'])
  if (!tasks) return false
  const seen = reminded()
  const due = dueReminders(tasks, from, now).filter((t) => !seen.includes(`${t.id}@${t.reminder_at}`))
  if (due.length === 0) return true
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify([...seen, ...due.map((t) => `${t.id}@${t.reminder_at}`)].slice(-100)))
  } catch {
    /* worst case a reminder repeats after a restart */
  }
  useNeedsYou.setState({ on: true })
  const projects = queryClient.getQueryData<Project[]>(['projects']) ?? []
  const rows = due.map((t) => ({ id: t.id, title: t.title, due_at: t.due_at, project: projects.find((p) => p.id === t.project_id)?.name ?? null }))
  const notice = deliver(reminderNotice(rows, prefs(), now, appZone()), prefs(), now, appZone())
  if (notice) void showLocal(notice)
  return true
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
  const target = focusTarget(tasks, f.activeTask?.id ?? null, useGoalStore.getState().goalTaskId)
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
      if (sweepReminders(from, now)) from = now
    }
    sweep()
    const id = window.setInterval(sweep, 30_000)
    return () => {
      delete w.__kfTray
      window.removeEventListener('focus', seen)
      window.clearInterval(id)
    }
  }, [tauri, navigate])

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
