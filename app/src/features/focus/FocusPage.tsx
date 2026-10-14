import React, { useState, useMemo, useRef } from 'react'
import { TaskPicker } from './TaskPicker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useTasks, completeTaskWithUndo } from '../tasks/api'
import { useProjects, useTimeEntries, logTimeEntry } from '../projects/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak } from '../routines/streaks'
import { useJournalEntries } from '../journal/api'
import { usePeople, useInteractions } from '../people/api'
import { useCalendarEvents } from '../calendar/api'
import { useDayRollover } from '../calendar/useDayRollover'
import { zoneTimeKey } from '../calendar/eventTime'
import { EveningRitual } from '../rituals/EveningRitual'
import { readSoundEvents, writeSoundEvents, previewSound } from '../../lib/sounds'
import { useMotionEnabled } from '../../lib/motion'
import { hydrangeaAsset, daisyAsset } from '../../lib/gardenAssets'
import { cherryStage, vineStage, fernByLength, wisteriaStage } from '../../lib/growthStages'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { useAppZone } from '../../lib/appZone'
import type { ActivityLogEntry } from '../../lib/types'
import { useFocusStore, DEFAULT_SETTINGS } from './focusStore'
import { NumberField } from '../../components/NumberField'
import { Checkbox, Toggle } from '../../components/kit'
import { Skeleton, ErrorCard } from '../../components/States'
import './FocusPage.css'

// R4-18 (2026-07-20 audit): the duration rows offered fixed presets only — Kai: "where are the
// custom times in the pomodoro setting". This is the any-value escape hatch beside each row.
function CustomMin({ value, presets, onChange }: { value: number; presets: number[]; onChange: (v: number) => void }) {
  const isCustom = !presets.includes(value)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {/* Kai 2026-10-06: the shared NumberField — select-on-focus, clearable while typing, −/+. */}
      <NumberField
        value={value}
        onChange={onChange}
        min={1}
        max={180}
        ariaLabel="Custom minutes"
        inputStyle={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-meta)',
          padding: '4px 6px',
          borderRadius: 999,
          color: isCustom ? 'var(--acc-terra)' : 'var(--ink-muted)',
          background: isCustom ? 'color-mix(in srgb, var(--acc-terra) 16%, transparent)' : 'none',
          border: `1px solid ${isCustom ? 'color-mix(in srgb, var(--acc-terra) 30%, transparent)' : 'var(--line-solid)'}`,
        }}
      />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>min</span>
    </span>
  )
}

// Punch 52 (Kai: "the setting icon for the focus page looks like a sun? fix that and use a
// gear"). The export's glyph really is a sun — hub + six radiating rays. This is a cog in the
// app's line-icon grammar (NavGlyphs.tsx: 15px, viewBox 24, stroke 1.8, currentColor, round
// caps): a rim with six teeth cut through it, so at icon size it reads as a gear, not a star.
const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <circle cx="12" cy="12" r="2.9" />
    <circle cx="12" cy="12" r="7.6" />
    <path d="M12 5.4 12 2.6M17.7 8.7 20.1 7.3M17.7 15.3 20.1 16.7M12 18.6 12 21.4M6.3 15.3 3.9 16.7M6.3 8.7 3.9 7.3" />
  </svg>
)

export function FocusPage() {
  const queryClient = useQueryClient()
  const motionOn = useMotionEnabled()

  // The user's day (their zone, rolled over at their midnight) — never the device's.
  const zone = useAppZone()
  useDayRollover()
  const todayStr = zoneDateKey(new Date(), zone)

  // 1. Data queries
  const tasksQ = useTasks()
  const projectsQ = useProjects()
  const timeEntriesQ = useTimeEntries()
  const routinesQ = useRoutines()
  const completionsQ = useRoutineCompletions()
  const journalQ = useJournalEntries()
  const peopleQ = usePeople()
  const interactionsQ = useInteractions()
  const { data: tasks = [] } = tasksQ
  const { data: projects = [] } = projectsQ
  const { data: timeEntries = [] } = timeEntriesQ
  const { data: routines = [] } = routinesQ
  const { data: completions = [] } = completionsQ
  const { data: journalEntries = [] } = journalQ
  const { data: people = [] } = peopleQ
  const { data: interactions = [] } = interactionsQ
  const { data: events = [] } = useCalendarEvents()

  // Only the first entry's date is used (the "days count"); this used to download the whole log.
  const activityQ = useQuery<Pick<ActivityLogEntry, 'created_at'>[]>({
    queryKey: ['activity_log', 'first'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) throw error
      return data as Pick<ActivityLogEntry, 'created_at'>[]
    },
  })
  const { data: activityLogs = [] } = activityQ
  // The beds and their captions read these — while one is still loading (or failed) the garden
  // would report empty beds that aren't empty, so it shows a skeleton / retry instead.
  const gardenQs = [tasksQ, projectsQ, timeEntriesQ, routinesQ, completionsQ, journalQ, peopleQ, interactionsQ, activityQ]
  const gardenPending = gardenQs.some((q) => q.isPending)
  const gardenFailed = gardenQs.some((q) => q.isError && !q.data)
  const retryGarden = () => {
    for (const q of gardenQs) if (q.isError) void q.refetch()
  }

  // 2. Settings — persisted in focusStore (shared with MiniFocus)
  const settings = useFocusStore((s) => s.settings)
  const saveSettings = useFocusStore((s) => s.saveSettings)
  // The chime row is a view onto the shared sound catalog (see the popover row below).
  const [chimeOn, setChimeOn] = useState(() => readSoundEvents().focus_end)

  // 3. Focus session state — R4-D3: owned by focusStore so a running session survives
  // navigation and is shared with the MiniFocus widget on a task's detail page.
  const {
    mode, isRunning, secondsLeft, stopwatchSeconds, stopwatchStartIso, stopwatchStartStr,
    currentRound, breakType, pomodoroStartIso,
  } = useFocusStore()
  const setStore = useFocusStore.setState
  const setMode = useFocusStore((s) => s.setMode)
  const storeActiveTask = useFocusStore((s) => s.activeTask)
  const setStoreActiveTask = useFocusStore((s) => s.setActiveTask)
  const setIsRunning = (v: boolean) => setStore({ isRunning: v })
  const setSecondsLeft = (v: number | ((p: number) => number)) =>
    setStore((s) => ({ secondsLeft: typeof v === 'function' ? v(s.secondsLeft) : v }))
  const setCurrentRound = (fn: (r: number) => number) => setStore((s) => ({ currentRound: fn(s.currentRound) }))
  const setPomodoroStartIso = (v: string | null) => setStore({ pomodoroStartIso: v })
  const setStopwatchSeconds = (v: number | ((p: number) => number)) =>
    setStore((s) => ({ stopwatchSeconds: typeof v === 'function' ? v(s.stopwatchSeconds) : v }))
  const setStopwatchStartIso = (v: string) => setStore({ stopwatchStartIso: v })
  const setStopwatchStartStr = (v: string) => setStore({ stopwatchStartStr: v })
  const activeTaskId = storeActiveTask?.id ?? null
  const setActiveTaskId = (id: string | null) => {
    const t = id ? tasks.find((x) => x.id === id) : null
    setStoreActiveTask(t ? { id: t.id, project_id: t.project_id } : null)
  }
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const pickerAnchor = useRef<HTMLSpanElement>(null)
  const [eveningOpen, setEveningOpen] = useState(false)

  // Active task selection
  const activeTask = useMemo(() => {
    if (activeTaskId) {
      return tasks.find((t) => t.id === activeTaskId && t.status === 'todo') || null
    }
    // Default to first starred task due/scheduled today, or any starred task
    return tasks.find((t) => t.top3 && t.status === 'todo') || tasks.find((t) => t.status === 'todo') || null
  }, [tasks, activeTaskId])

  // Project linked to active task
  const activeProject = useMemo(() => {
    if (!activeTask) return null
    return projects.find((p) => p.id === activeTask.project_id) || null
  }, [projects, activeTask])

  // The tick loop lives in focusStore (driven by useFocusTicker in the shell), so the
  // session keeps running when Kai navigates away from this page.


  // Handle Play/Pause toggle: the store's own, so a fresh round sounds focus_start here too (Sounds v2)
  // instead of a copy of it that stamped the start and skipped the sound.
  const togglePlay = () => useFocusStore.getState().togglePlay()

  // Handle "+5 min"
  const addFiveMinutes = () => {
    setSecondsLeft((prev) => prev + 5 * 60)
  }

  // Handle Check Off
  const handleCheckOff = () => {
    if (!activeTask) return

    // If pomodoro timer is active, compute elapsed minutes and log them as partial work
    if (mode === 'pomodoro' && isRunning) {
      const elapsedSec = settings.focusRoundMin * 60 - secondsLeft
      const elapsedMin = Math.ceil(elapsedSec / 60)
      if (elapsedMin > 0) {
        logTimeEntry(
          activeTask.project_id,
          activeTask.id,
          'Focused block (task completed)',
          elapsedMin,
          pomodoroStartIso || new Date().toISOString()
        )
      }
    }

    // Polish F2a: "Done" toast + Undo, like every other check. Undo reopens the task (it comes
    // back as the active task); the focused minutes logged above stay — that time was spent.
    completeTaskWithUndo(activeTask)
    setIsRunning(false)
    setPomodoroStartIso(null)
    if (mode === 'pomodoro') {
      setSecondsLeft(settings.focusRoundMin * 60)
    }

    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['time_entries'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // Handle Stop & Log in Stopwatch mode
  const handleStopAndLog = () => {
    const elapsedMin = Math.round(stopwatchSeconds / 60)
    if (elapsedMin > 0 && activeTask) {
      logTimeEntry(
        activeTask.project_id,
        activeTask.id,
        noteText || 'Stopwatch session',
        elapsedMin,
        stopwatchStartIso || new Date().toISOString()
      )
    }
    setStopwatchSeconds(0)
    setIsRunning(false)
    setNoteText('')
    setStopwatchStartIso('')
    setStopwatchStartStr('')

    queryClient.invalidateQueries({ queryKey: ['time_entries'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // Handle discard in Stopwatch mode
  const handleDiscardStopwatch = () => {
    setStopwatchSeconds(0)
    setIsRunning(false)
    setNoteText('')
    setStopwatchStartIso('')
    setStopwatchStartStr('')
  }

  // 4. Botanical Stage Calculations
  // Tasks (Cherry)
  const cherryData = useMemo(() => {
    const todayTasks = tasks.filter((t) => {
      const dueToday = t.due_at && zoneDateKey(new Date(t.due_at), zone) === todayStr
      const schedToday = t.scheduled_start && zoneDateKey(new Date(t.scheduled_start), zone) === todayStr
      const completedToday =
        t.status === 'done' && t.completed_at && zoneDateKey(new Date(t.completed_at), zone) === todayStr
      return dueToday || schedToday || completedToday || (t.top3 && t.status === 'todo')
    })
    const completedCount = todayTasks.filter((t) => t.status === 'done').length
    const totalCount = todayTasks.length
    // F2: the stage is lib/growthStages' (Today / Tasks bucket the same way); only the caption is ours.
    const stage = cherryStage(totalCount - completedCount, completedCount)
    if (totalCount === 0) return { stage, note: 'no tasks scheduled' }
    if (stage === 'fallen') return { stage, note: `${completedCount} of ${totalCount} petals fell` }
    return { stage, note: `${completedCount} of ${totalCount} tasks done` }
  }, [tasks, todayStr, zone])

  // Inbox (Hydrangea)
  const hydrangeaData = useMemo(() => {
    const pendingCount = tasks.filter((t) => t.status === 'todo' && t.area_id === null && !t.project_id).length // Inbox proxy
    const asset = hydrangeaAsset(pendingCount)
    return { stage: asset.src, note: asset.note }
  }, [tasks])

  // Calendar (Daisy)
  const daisyData = useMemo(() => {
    const hour = Number(zoneTimeKey(new Date(), zone).slice(0, 2))
    const asset = daisyAsset(hour)
    return { stage: asset.src, note: asset.note }
  }, [zone])

  // Routines (Vine)
  const vineData = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let currentStreak = 0
    for (const r of routines) {
      if (!r.active) continue
      const s = computeStreak(byRoutine.get(r.id) ?? [], r.cadence)
      currentStreak = Math.max(currentStreak, s.current)
    }
    return {
      stage: vineStage(currentStreak),
      streak: currentStreak,
      note: currentStreak > 0 ? `day ${currentStreak} — kept again` : 'bare streak',
    }
  }, [routines, completions])

  // Journal (Fern)
  const fernData = useMemo(() => {
    // D-1: one day = many entries, so sum the day rather than reading only the first.
    // entry_date is the user's day, so it is matched against the user's today (not the device's).
    const today = journalEntries.filter((e) => e.entry_date === todayStr)
    const wordCount = today.reduce((n, e) => n + e.body.trim().split(/\s+/).filter(Boolean).length, 0)
    // F2: the same fern the Journal page draws for this day (fernByLength over the day's text).
    const stage = fernByLength(today.reduce((n, e) => n + e.body.length, 0))
    // A photo-only day is kept (journalDay's isWritten), so it isn't "unwritten" here either.
    const photos = today.reduce((n, e) => n + (e.media_paths?.length ?? 0), 0)
    return { stage, note: wordCount > 0 ? `${wordCount} words tonight` : photos > 0 ? `${photos} ${photos === 1 ? 'photo' : 'photos'} tonight` : 'unwritten journal' }
  }, [journalEntries, todayStr])

  // Projects (Wisteria)
  const wisteriaData = useMemo(() => {
    const proj = activeProject || projects[0]
    if (!proj) return { stage: 'p0', note: 'no projects' }

    const milestones = proj.milestones || []
    if (milestones.length === 0) return { stage: 'p0', note: `${proj.name} — 0%` }

    // The Projects page's figure (weighted milestones; one with linked tasks is done when they all
    // are) and F2's wisteriaStage — so the same project never shows two different plants.
    let weight = 0
    let done = 0
    for (const m of milestones) {
      const linked = tasks.filter((t) => t.milestone_id === m.id)
      weight += m.weight
      if (linked.length > 0 ? linked.every((t) => t.status === 'done') : m.completed) done += m.weight
    }
    const pct = weight > 0 ? Math.round((done / weight) * 100) : 0

    return { stage: wisteriaStage(pct), percent: pct, note: `climbing — ${pct}%` }
  }, [activeProject, projects, tasks])

  // Clover / People — punch 52: the caption used to be the export's literal "folded for the
  // night", which is a lie at 10am in the timer's garden strip. The six sibling beds all report
  // a real number, so this one does too: people who've gone quiet, using PeoplePage's own
  // 21-day nudge threshold. The *stage* stays `resting` — the export pins resting.png in both
  // Focus spots and Foundation's growthStages.ts defines no clover threshold to bind to.
  const cloverData = useMemo(() => {
    if (people.length === 0) return { stage: 'resting', note: 'no people yet' }
    const latest = new Map<string, string>()
    for (const i of interactions) {
      const prev = latest.get(i.person_id)
      if (!prev || i.occurred_at > prev) latest.set(i.person_id, i.occurred_at)
    }
    const quiet = people.filter((p) => {
      const last = latest.get(p.id)
      return !last || (Date.now() - new Date(last).getTime()) / 86400000 > 21
    }).length
    return {
      stage: 'resting',
      note: quiet > 0 ? `${quiet} quiet for a while` : 'everyone recently tended',
    }
  }, [people, interactions])

  // 5. Stat metrics for Dusk Garden View
  const stats = useMemo(() => {
    const completedToday = tasks.filter(
      (t) => t.status === 'done' && t.completed_at && zoneDateKey(new Date(t.completed_at), zone) === todayStr
    ).length

    const todayEntries = timeEntries.filter((e) => zoneDateKey(new Date(e.started_at), zone) === todayStr)
    const totalMin = todayEntries.reduce((sum, e) => sum + e.duration_min, 0)
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    const timeText = hrs > 0 ? `${hrs}h ${mins}m kept` : `${mins}m kept`

    const firstLog = activityLogs.length > 0 ? new Date(activityLogs[0].created_at) : new Date()
    const daysCount = Math.max(1, Math.ceil((Date.now() - firstLog.getTime()) / 86400000))

    return {
      completedToday,
      timeText,
      daysCount,
    }
  }, [tasks, timeEntries, activityLogs, todayStr, zone])

  // ── Punch 52 / item 9: the top strip used to read `Deep work block · 9:00 – 11:00` and
  // `session 2 of 3 today` — both design samples. Both now come from real state, and both
  // disappear when there is nothing true to say (there is no "planned sessions" number
  // anywhere in the data, so the `of 3` half is gone rather than guessed).

  // The block: the calendar block this task is actually sitting in today — that's where the
  // design's "Deep work block" name comes from. Falls back to the task's own scheduled window
  // (times, no name, because nothing in the data names it), then to nothing.
  const blockLabel = useMemo(() => {
    if (!activeTask) return null
    const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: zone })

    const block = events.find(
      (e) => e.task_id === activeTask.id && !e.all_day && zoneDateKey(new Date(e.starts_at), zone) === todayStr
    )
    if (block) return `${block.title} · ${t(new Date(block.starts_at))} – ${t(new Date(block.ends_at))}`

    if (!activeTask.scheduled_start || !activeTask.scheduled_end) return null
    const start = new Date(activeTask.scheduled_start)
    if (zoneDateKey(start, zone) !== todayStr) return null
    return `${t(start)} – ${t(new Date(activeTask.scheduled_end))}`
  }, [activeTask, events, todayStr, zone])

  // Sessions today: work already logged today, plus the one in progress.
  const sessionsToday = useMemo(() => {
    const logged = timeEntries.filter((e) => zoneDateKey(new Date(e.started_at), zone) === todayStr).length
    const inProgress = pomodoroStartIso !== null || stopwatchSeconds > 0 ? 1 : 0
    return logged + inProgress
  }, [timeEntries, pomodoroStartIso, stopwatchSeconds, todayStr, zone])

  // Subtask progress: real children (migration 0029, one level deep). Falls back to the task's
  // own notes, and to nothing at all — never to the export's "draft the cohort model".
  const subtaskLabel = useMemo(() => {
    if (!activeTask) return null
    const children = tasks.filter((t) => t.parent_task_id === activeTask.id)
    if (children.length > 0) {
      const done = children.filter((t) => t.status === 'done').length
      const next = children.find((t) => t.status !== 'done')
      return `subtask ${Math.min(done + 1, children.length)} of ${children.length}${next ? ` · ${next.title}` : ''}`
    }
    return activeTask.notes?.trim() || null
  }, [activeTask, tasks])

  // Rhythm preview calculation for Settings
  const rhythmPreviewData = useMemo(() => {
    const totalMin =
      settings.focusRoundMin * settings.roundsBeforeLongBreak +
      settings.shortBreakMin * (settings.roundsBeforeLongBreak - 1) +
      settings.longBreakMin
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    return {
      totalMin,
      text: `${hrs > 0 ? `${hrs}h ` : ''}${mins}m per cycle`,
    }
  }, [settings])

  // Format MM:SS for countdown timers
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format Stopwatch time
  const formatStopwatch = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progressRatio = secondsLeft / (settings.focusRoundMin * 60)

  // Dynamic coordinates for Break circle
  const breakTotalSeconds = (breakType === 'short' ? settings.shortBreakMin : settings.longBreakMin) * 60
  const breakRatio = secondsLeft / breakTotalSeconds
  const breakDashoffset = 528 * (1 - breakRatio)

  // Stopwatch live hours projection calculation
  const stopwatchProjectedHours = useMemo(() => {
    // Punch 52: no project, no hours. This used to fall back to the export's 11.5 → 12.1.
    if (!activeProject) return null
    // Get all time entries for active project
    const projectEntries = timeEntries.filter((e) => e.project_id === activeProject.id)
    const totalMinutes = projectEntries.reduce((sum, e) => sum + e.duration_min, 0)
    const beforeHours = parseFloat((totalMinutes / 60).toFixed(1))
    const afterHours = parseFloat(((totalMinutes + stopwatchSeconds / 60) / 60).toFixed(1))
    return { before: beforeHours, after: afterHours }
  }, [activeProject, timeEntries, stopwatchSeconds])

  // Select task from list
  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId)
    setTaskPickerOpen(false)
  }

  // Render Dusk Garden View (Option 1b)
  if (mode === 'garden') {
    const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: zone })
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--paper-linen)', zIndex: 30 }}>
        {/* Ambient pollen motes */}
        {motionOn && (
          <>
            <span className="mote" style={{ left: '24%', animationDelay: '2s' }}></span>
            <span className="mote" style={{ left: '60%', animationDelay: '5s', width: 3, height: 3 }}></span>
            <span className="mote" style={{ left: '84%', animationDelay: '0.8s' }}></span>
            <span className="petal" style={{ left: '14%', animationDelay: '0s', animationDuration: '9s' }}></span>
            <span className="petal" style={{ left: '30%', animationDelay: '3.2s', animationDuration: '10.5s', width: 9, height: 7 }}></span>
            <span className="petal" style={{ left: '47%', animationDelay: '6.4s', animationDuration: '8.8s' }}></span>
            <span className="petal" style={{ left: '71%', animationDelay: '1.8s', animationDuration: '11s', width: 10, height: 8 }}></span>
          </>
        )}

        {(gardenPending || gardenFailed) && (
          <div style={{ position: 'absolute', left: '50%', bottom: 140, width: 360, maxWidth: 'calc(100% - 32px)', transform: 'translateX(-50%)', zIndex: 25 }}>
            {gardenPending ? <Skeleton rows={2} /> : <ErrorCard message="Couldn't read the garden." onRetry={retryGarden} />}
          </div>
        )}

        {/* The 7 beds */}
        {!gardenPending && !gardenFailed && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 min(90px, 6vw)', zIndex: 10, overflowX: 'auto' }}>
          {/* Bed 1: Tasks */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/cherry/${cherryData.stage}.png`} alt="" style={{ height: 150, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-1.2deg)' }}>
              {cherryData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Tasks</div>
          </div>

          {/* Bed 2: Inbox */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <span className="focus-bloom-glow-slow" style={{ position: 'absolute', left: '50%', bottom: 40, width: 110, height: 110, transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,165,90,0.35), rgba(201,165,90,0) 70%)', pointerEvents: 'none' }}></span>
            <img className="focus-sway" src={`/ds/assets/hydrangea/${hydrangeaData.stage}.png`} alt="" style={{ height: 120, animationDelay: '1.4s', filter: 'var(--shadow-drop-sm)', position: 'relative' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(0.8deg)' }}>
              {hydrangeaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Inbox</div>
          </div>

          {/* Bed 3: Calendar */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/daisy/${daisyData.stage}.png`} alt="" style={{ height: 118, animationDelay: '2.8s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-0.8deg)' }}>
              {daisyData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Calendar</div>
          </div>

          {/* Bed 4: Routines */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <img className="focus-sway" src={`/ds/assets/vine/${vineData.stage}.png`} alt="" style={{ height: 140, animationDelay: '0.9s', filter: 'var(--shadow-drop-sm)' }} />
            <span className="focus-dew-glint" style={{ position: 'absolute', right: 8, top: 26, width: 9, height: 9, background: 'radial-gradient(circle at 40% 40%, var(--star, #FDFBF4), transparent 65%)', borderRadius: '50%' }}></span>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(1deg)' }}>
              {vineData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Routines</div>
          </div>

          {/* Bed 5: Journal */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/fern/${fernData.stage}.png`} alt="" style={{ height: 124, animationDelay: '3.6s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-1deg)' }}>
              {fernData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Journal</div>
          </div>

          {/* Bed 6: Projects */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/wisteria/${wisteriaData.stage}.png`} alt="" style={{ height: 136, animationDelay: '1.9s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(0.7deg)' }}>
              {wisteriaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Projects</div>
          </div>

          {/* Bed 7: People */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/clover/${cloverData.stage}.png`} alt="" style={{ height: 86, animationDelay: '4.4s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-0.6deg)' }}>
              {cloverData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>People &amp; chat</div>
          </div>
        </div>
        )}

        {/* Soil line */}
        <span style={{ position: 'absolute', left: 60, right: 60, bottom: 118, borderBottom: '1.5px dashed rgba(90,82,110,0.5)' }}></span>

        {/* Dusk veil + vignette */}
        <span className="focus-veil-breathe" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(46,40,62,0.42), rgba(26,22,36,0.66) 85%)', mixBlendMode: 'multiply', pointerEvents: 'none' }}></span>
        <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 110px rgba(20,16,28,0.5)', pointerEvents: 'none' }}></span>

        {/* Fireflies above the veil */}
        {motionOn && (
          <>
            <span className="fly" style={{ left: '18%', top: '38%', animationDelay: '0s,0s' }}></span>
            <span className="fly" style={{ left: '41%', top: '30%', animationDelay: '1.7s,2.4s', width: 4, height: 4 }}></span>
            <span className="fly" style={{ left: '58%', top: '46%', animationDelay: '3.2s,1.2s' }}></span>
            <span className="fly" style={{ left: '76%', top: '33%', animationDelay: '2.4s,4s', width: 4, height: 4 }}></span>
            <span className="fly" style={{ left: '88%', top: '55%', animationDelay: '0.9s,3s' }}></span>
          </>
        )}

        <div className="grain" style={{ opacity: 0.3 }}></div>

        {/* Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '30px 40px', zIndex: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-wide)', textTransform: 'uppercase', color: '#b8b0c8' }}>
              Your garden{activityQ.data ? ` · day ${stats.daysCount}` : ''}
            </div>
            <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, letterSpacing: 'var(--ls-display)', color: '#f0ebdd' }}>
              {weekdayName}, closing
            </h1>
          </div>
          {!gardenPending && !gardenFailed && <div style={{ display: 'flex', gap: 8 }}>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {stats.completedToday} task{stats.completedToday === 1 ? '' : 's'} done
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {stats.timeText}
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {vineData.streak}-day streak
            </span>
          </div>}
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px', zIndex: 20 }}>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: '#c9c0d8', transform: 'rotate(-1deg)' }}>
            everything tended, nothing waiting ✿
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              onClick={() => setMode('pomodoro')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-tight)', textTransform: 'uppercase', color: '#a89fc0', cursor: 'pointer' }}
            >
              stay a while
            </span>
            {/* Punch 52: the CTA says "evening ritual" and used to open the *weekly* review.
                The evening ritual has no route of its own — it's a fixed-inset overlay that
                Today and Routines mount from local state — so Focus mounts it the same way. */}
            <button
              onClick={() => setEveningOpen(true)}
              style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
            >
              Close the day → evening ritual
            </button>
          </div>
        </div>

        {eveningOpen && <EveningRitual onClose={() => setEveningOpen(false)} />}
      </div>
    )
  }

  // 6. Base Timer layout (Pomodoro / Break / Stopwatch)
  return (
    <div className="focus-bleed" style={{ position: 'relative', width: '100%', height: 'calc(var(--kf-vh) - 100px)', display: 'flex', flexDirection: 'column', background: 'var(--paper-linen)', margin: '-30px -40px -64px' }}>
      {/* WB-3 punch 64: the negative margins cancel `.app-main-content`'s DESKTOP padding
          (30/40/64). At ≤767px that padding is 20/16/tab-bar, so -40px bled 24px past each
          edge and gave /focus a horizontal scrollbar. Re-state the bleed against the phone
          padding, and stop short of the tab bar instead of under it. */}
      {/* Kai's phone review (2026-10-07): at a fixed height the timer view ran under the tab bar
          (the garden strip and the controls' last row sat behind it), the controls ran off the right
          edge and the mode row wrapped a word per line. On a phone it grows with its content (the
          page scrolls), the rows wrap whole, and the desktop-only "esc leaves quietly" steps aside. */}
      <style>{`
        @media (max-width: 767px) {
          .focus-bleed {
            margin: -20px -16px 0 !important;
            height: auto !important;
            min-height: calc(var(--kf-vh) - 42px - 88px - env(safe-area-inset-bottom));
          }
          .fp-strip { padding: 0 16px !important; }
          .fp-esc { display: none; }
          .fp-modes, .fp-ctrls { flex-wrap: wrap; justify-content: center; row-gap: 12px !important; padding: 0 16px; }
          .fp-strip .chip { white-space: nowrap; }
          .fp-modes > * { max-width: 100%; }
          .fp-round { min-width: 0; }
          .fp-ctrls > button { min-height: 48px; white-space: nowrap; }
          .fp-ctrls > span { padding: 14px 4px; }
          .fp-task { padding: 0 16px; }
          .fp-garden-note { left: 16px !important; }
          .fp-garden-link { right: 16px !important; bottom: auto !important; top: 10px; }
          /* width:100% + the negative margins left the page 32px short of the right edge, so the
             settings card sat off-centre; and the two break columns don't fit side by side. */
          .focus-bleed { width: auto !important; }
          .fp-breaks { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div className="grain" style={{ pointerEvents: 'none' }}></div>

      {/* Quiet top strip */}
      <div className="fp-strip" style={{ height: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', borderBottom: '1px dashed var(--line-solid)', position: 'relative', zIndex: 10 }}>
        <span className="flabel" style={{ fontSize: 'var(--fs-meta)' }}>Focus{blockLabel ? ` · ${blockLabel}` : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {sessionsToday > 0 && (
            <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              session {sessionsToday} today
            </span>
          )}
          <span className="flabel fp-esc">esc leaves quietly</span>
        </div>
      </div>

      {/* Center content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, paddingBottom: 20 }}>
        {/* Ambient pollen motes */}
        {motionOn && (
          <>
            <span className="mote" style={{ left: '16%', animationDelay: '0s' }}></span>
            <span className="mote" style={{ left: '29%', animationDelay: '3.4s', width: 3, height: 3 }}></span>
            <span className="mote" style={{ left: '72%', animationDelay: '1.6s' }}></span>
            <span className="mote" style={{ left: '86%', animationDelay: '5.2s', width: 3, height: 3 }}></span>
          </>
        )}

        {/* Mode Switcher pill and settings button */}
        {mode !== 'break' && (
          <div className="fp-modes" style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, padding: 3, gap: 3 }}>
              <span
                onClick={() => {
                  setMode('pomodoro')
                  setIsRunning(false)
                  setSecondsLeft(settings.focusRoundMin * 60)
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: mode === 'pomodoro' ? 'var(--paper-parchment)' : 'none',
                  border: mode === 'pomodoro' ? '1px solid var(--line-card)' : '1px solid transparent',
                  boxShadow: mode === 'pomodoro' ? 'var(--shadow-crisp)' : 'none',
                  fontSize: 12,
                  fontWeight: mode === 'pomodoro' ? 600 : 400,
                  color: mode === 'pomodoro' ? 'var(--ink-body)' : 'var(--ink-muted)',
                  cursor: 'pointer',
                }}
              >
                Pomodoro
              </span>
              <span
                onClick={() => {
                  setMode('stopwatch')
                  setIsRunning(false)
                  setStopwatchSeconds(0)
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: mode === 'stopwatch' ? 'var(--paper-parchment)' : 'none',
                  border: mode === 'stopwatch' ? '1px solid var(--line-card)' : '1px solid transparent',
                  boxShadow: mode === 'stopwatch' ? 'var(--shadow-crisp)' : 'none',
                  fontSize: 12,
                  fontWeight: mode === 'stopwatch' ? 600 : 400,
                  color: mode === 'stopwatch' ? 'var(--ink-body)' : 'var(--ink-muted)',
                  cursor: 'pointer',
                }}
              >
                Stopwatch
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {mode === 'pomodoro' && (
                <>
                  {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, idx) => {
                    const isDone = idx + 1 < currentRound
                    const isActive = idx + 1 === currentRound
                    return (
                      <span
                        key={idx}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: isDone || isActive ? 'var(--acc-terra)' : 'none',
                          border: isDone || isActive ? 'none' : '1.5px solid var(--line-sidebar)',
                          outline: isActive ? '2px solid var(--paper-linen)' : 'none',
                          boxShadow: isActive ? '0 0 0 3.5px color-mix(in srgb, var(--acc-terra) 35%, transparent)' : 'none',
                        }}
                      />
                    )
                  })}
                  <span className="fp-round" style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                    round {currentRound} of {settings.roundsBeforeLongBreak} · long break after
                  </span>
                </>
              )}

              <span
                className="kf-hit"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', color: 'var(--ink-muted)', cursor: 'pointer' }}
                title="pomodoro settings"
              >
                <GearIcon />
              </span>
            </div>
          </div>
        )}

        {/* 1c: BREAK VIEW */}
        {mode === 'break' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-wide)', textTransform: 'uppercase', color: 'var(--acc-sage-text)', position: 'relative', zIndex: 5 }}>
              {breakType === 'short' ? `Short break · round ${currentRound} done` : 'Long break · cycle complete'}
            </div>
            <div style={{ position: 'relative', width: 190, height: 190, marginTop: 18 }}>
              <svg width="190" height="190" viewBox="0 0 190 190" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="95" cy="95" r="84" fill="none" stroke="var(--line-card)" strokeWidth="8"></circle>
                <circle cx="95" cy="95" r="84" fill="none" stroke="var(--acc-sage)" strokeWidth="8" strokeLinecap="round" strokeDasharray="528" strokeDashoffset={breakDashoffset}></circle>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500, lineHeight: 1, color: 'var(--ink-body)' }}>
                  {formatTime(secondsLeft)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 6 }}>
                  of {breakType === 'short' ? settings.shortBreakMin : settings.longBreakMin} min
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
              stand up — go water something real ✿
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <button
                onClick={() => {
                  setIsRunning(false)
                  setMode('pomodoro')
                  setSecondsLeft(settings.focusRoundMin * 60)
                  setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
                }}
                style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 17px', borderRadius: 999, cursor: 'pointer' }}
              >
                Skip break
              </button>
              <button
                onClick={() => {
                  setMode('pomodoro')
                  setSecondsLeft(settings.focusRoundMin * 60)
                  setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
                  setIsRunning(true)
                }}
                style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 19px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
              >
                Back to work →
              </button>
            </div>
            <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              after round {settings.roundsBeforeLongBreak} · a {settings.longBreakMin}-min long break, garden view opens on its own
            </div>
          </div>
        )}

        {/* 1a: POMODORO TIMER */}
        {mode === 'pomodoro' && (
          <>
            <div style={{ position: 'relative', width: 320, height: 320 }}>
              <svg width="320" height="320" viewBox="0 0 320 320" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="160" cy="160" r="146" fill="none" stroke="var(--line-card)" strokeWidth="10"></circle>
                <circle cx="160" cy="160" r="146" fill="none" stroke="var(--acc-lavender)" strokeWidth="10" strokeLinecap="round" strokeDasharray="917" strokeDashoffset={917 * (1 - progressRatio)}></circle>
              </svg>
              {/* deviation(2026-07-20 R4): the bud marker that rode the progress tip is gone —
                  Kai: "there is a weird flower at the top of the timer". At a full timer it
                  parks dead-centre above the clock and reads as a stray graphic. */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-wide)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  remaining
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 74, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink-body)', marginTop: 6 }}>
                  {formatTime(secondsLeft)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-tight)', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 8 }}>
                  {/* Punch 52: the export reads `of 25 min · 5-min break at 10:20` — the length
                      qualifier had been dropped. It's the *next* break, so it's the long one on
                      the last round of the cycle. */}
                  of {settings.focusRoundMin} min ·{' '}
                  {currentRound >= settings.roundsBeforeLongBreak ? settings.longBreakMin : settings.shortBreakMin}-min break at{' '}
                  {new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: zone })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 1d: STOPWATCH TIMER */}
        {mode === 'stopwatch' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0 44px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 26 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 66, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--ink-body)' }}>
                {formatStopwatch(stopwatchSeconds)}
              </span>
              <span className="focus-bloom-glow" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-terra)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 8 }}>
              {isRunning ? 'recording' : 'paused'}
              {stopwatchStartStr ? ` · started ${stopwatchStartStr}` : ''}
            </div>
          </div>
        )}

        {/* Active Task display */}
        {mode !== 'break' && (
          <>
            {tasksQ.isPending ? (
              <div style={{ marginTop: 30, width: 320, maxWidth: '100%' }}><Skeleton rows={1} /></div>
            ) : tasksQ.isError && !tasksQ.data ? (
              <div style={{ marginTop: 30, width: 360, maxWidth: '100%' }}><ErrorCard message="Couldn't load your tasks." onRetry={() => void tasksQ.refetch()} /></div>
            ) : (
            <div className="fp-task" style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 30, position: 'relative' }}>
              {/* The kit box (44+ hit on touch via .kf-checkbox); completing = completeTaskWithUndo's toast + Undo. */}
              <Checkbox checked={false} size={19} label={activeTask?.title} disabled={!activeTask} onChange={handleCheckOff} />
              <span
                ref={pickerAnchor}
                onClick={() => setTaskPickerOpen(!taskPickerOpen)}
                style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink-body)', cursor: 'pointer', borderBottom: '1px dashed var(--line-dashed)' }}
                title="Click to select another task"
              >
                {activeTask ? activeTask.title : 'No active task selected'}
              </span>
              {activeTask?.top3 && <span style={{ color: 'var(--acc-terra)', fontSize: 17 }}>★</span>}

              {/* Task Picker — searchable, kept inside the window (Kai 2026-10-03) */}
              {taskPickerOpen && (
                <TaskPicker tasks={tasks} anchorRef={pickerAnchor} onPick={handleSelectTask} onClose={() => setTaskPickerOpen(false)} />
              )}
            </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              {activeProject && (
                <span className="chip" style={{ background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>
                  {activeProject.name}
                </span>
              )}
              {subtaskLabel && (
                <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 3 }}>
                  {subtaskLabel}
                </span>
              )}
            </div>
          </>
        )}

        {/* 1d: STOPWATCH target project / logging panel */}
        {mode === 'stopwatch' && (
          <div style={{ width: '420px', marginTop: 24, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 8, boxShadow: 'var(--shadow-crisp)', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              on stop, this lands automatically
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="chip" style={{ background: 'color-mix(in srgb, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>
                work · {Math.round(stopwatchSeconds / 60)}m
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-body)' }}>
                Projects → {activeProject ? activeProject.name : 'Unlinked'} → Activity
              </span>
              {stopwatchProjectedHours && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
                  hours {stopwatchProjectedHours.before} → <b style={{ color: 'var(--ink-body)', fontWeight: 600 }}>{stopwatchProjectedHours.after}</b>
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="What are you working on? (Optional note)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--paper-bone)',
                border: '1px solid var(--line-card)',
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 12.5,
                color: 'var(--ink-body)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Controls */}
        {mode !== 'break' && (
          <div className="fp-ctrls" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 32 }}>
            <button
              onClick={togglePlay}
              style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {isRunning ? '❙❙ Pause' : '▶ Start'}
            </button>
            {mode === 'pomodoro' ? (
              <>
                <button
                  onClick={handleCheckOff}
                  style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
                >
                  Done — check it off ✓
                </button>
                <button
                  onClick={addFiveMinutes}
                  style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}
                >
                  +5 min
                </button>
                <span
                  onClick={() => {
                    setIsRunning(false)
                    setSecondsLeft(settings.focusRoundMin * 60)
                    setPomodoroStartIso(null)
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer', marginLeft: 6 }}
                >
                  End early…
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={handleStopAndLog}
                  disabled={stopwatchSeconds === 0}
                  style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 19px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', opacity: stopwatchSeconds === 0 ? 0.6 : 1 }}
                >
                  Stop &amp; log ✓
                </button>
                <span
                  onClick={handleDiscardStopwatch}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}
                >
                  discard
                </span>
              </>
            )}
          </div>
        )}

        {mode !== 'break' && (
          <div style={{ marginTop: 18, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', transform: 'rotate(-0.8deg)' }}>
            nothing else exists for the next hour ✿
          </div>
        )}
      </div>

      {/* Garden Strip at the bottom */}
      <div style={{ flex: 'none', position: 'relative', height: 190, borderTop: '1px dashed var(--line-solid)', overflow: 'hidden' }}>
        {motionOn && (
          <>
            <span className="petal" style={{ left: '12%', animationDelay: '1s', animationDuration: '8.4s' }}></span>
            <span className="petal" style={{ left: '22%', animationDelay: '4.8s', width: 9, height: 7 }}></span>
          </>
        )}

        {/* Glow behind the active working plant */}
        {activeProject && (
          <span className="focus-bloom-glow" style={{ position: 'absolute', left: 158 + projects.indexOf(activeProject) * 150, bottom: 16, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,165,90,0.4), rgba(201,165,90,0) 70%)', pointerEvents: 'none' }}></span>
        )}

        {/* The 7 small beds — only once their data is in (an empty bed while loading would be a lie;
            the task line above carries the skeleton / retry). */}
        {!gardenPending && !gardenFailed && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 min(130px, 7vw)', zIndex: 10 }}>
          <img className="focus-sway" src={`/ds/assets/cherry/${cherryData.stage}.png`} alt="" style={{ height: 120, filter: 'var(--shadow-drop-sm)' }} title={cherryData.note} />
          <img className="focus-sway" src={`/ds/assets/hydrangea/${hydrangeaData.stage}.png`} alt="" style={{ height: 96, animationDelay: '1.2s', filter: 'var(--shadow-drop-sm)' }} title={hydrangeaData.note} />
          <img className="focus-sway" src={`/ds/assets/daisy/${daisyData.stage}.png`} alt="" style={{ height: 100, animationDelay: '2.6s', filter: 'var(--shadow-drop-sm)' }} title={daisyData.note} />
          <img className="focus-sway" src={`/ds/assets/vine/${vineData.stage}.png`} alt="" style={{ height: 110, animationDelay: '0.6s', filter: 'var(--shadow-drop-sm)' }} title={vineData.note} />
          <img className="focus-sway" src={`/ds/assets/fern/${fernData.stage}.png`} alt="" style={{ height: 88, animationDelay: '3.4s', filter: 'var(--shadow-drop-sm)' }} title={fernData.note} />
          <img className="focus-sway" src={`/ds/assets/wisteria/${wisteriaData.stage}.png`} alt="" style={{ height: 110, animationDelay: '1.8s', filter: 'var(--shadow-drop-sm)' }} title={wisteriaData.note} />
          <img className="focus-sway" src={`/ds/assets/clover/${cloverData.stage}.png`} alt="" style={{ height: 78, animationDelay: '4.2s', filter: 'var(--shadow-drop-sm)' }} title={cloverData.note} />
        </div>
        )}
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 24, borderBottom: '1px dashed var(--line-dashed)' }}></span>
        <div className="fp-garden-note" style={{ position: 'absolute', left: 36, bottom: 4, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
          the garden grows while you work
        </div>
        <span
          onClick={() => setMode('garden')}
          className="fp-garden-link"
          style={{ position: 'absolute', right: 36, bottom: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-tight)', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer' }}
        >
          Open the garden →
        </span>
      </div>

      {/* 1e: SETTINGS POPOVER (Modal Overlay) */}
      {isSettingsOpen && (
        <div className="fp-scrim-in" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--kf-shadow-rgb, 60,52,38), 0.05)', zIndex: 100 }}>
          {/* deviation(2026-07-18 audit): no rotate() on the settings card — text containers stay
              transform-free for crisp rendering (same ruling as C4). Washi tape keeps the tilt. */}
          <div className="fp-card-in" style={{ position: 'relative', width: 420, maxWidth: 'calc(var(--kf-vw) - 32px)', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '18px 20px 20px' }}>
            {/* Washi tape decoration */}
            <span className="washi-tape-settings"></span>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Pomodoro settings
              </span>
              <span
                onClick={() => setIsSettingsOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', cursor: 'pointer' }}
              >
                ✕
              </span>
            </div>

            {/* Focus round */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
              Focus round
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {[15, 25, 45, 50].map((t) => (
                <span
                  key={t}
                  onClick={() => saveSettings({ ...settings, focusRoundMin: t })}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-meta)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background: settings.focusRoundMin === t ? 'color-mix(in srgb, var(--acc-terra) 16%, transparent)' : 'none',
                    color: settings.focusRoundMin === t ? 'var(--acc-terra)' : 'var(--ink-muted)',
                    border: settings.focusRoundMin === t ? '1px solid color-mix(in srgb, var(--acc-terra) 30%, transparent)' : '1px solid var(--line-solid)',
                  }}
                >
                  {t}m
                </span>
              ))}
              <CustomMin value={settings.focusRoundMin} presets={[15, 25, 45, 50]} onChange={(v) => saveSettings({ ...settings, focusRoundMin: v })} />
            </div>

            <div className="fp-breaks" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Short break */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
                  Short break
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[3, 5, 10].map((t) => (
                    <span
                      key={t}
                      onClick={() => saveSettings({ ...settings, shortBreakMin: t })}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-meta)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '4px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        background: settings.shortBreakMin === t ? 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' : 'none',
                        color: settings.shortBreakMin === t ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        border: settings.shortBreakMin === t ? '1px solid color-mix(in srgb, var(--acc-moss) 35%, transparent)' : '1px solid var(--line-solid)',
                      }}
                    >
                      {t}m
                    </span>
                  ))}
                  <CustomMin value={settings.shortBreakMin} presets={[3, 5, 10]} onChange={(v) => saveSettings({ ...settings, shortBreakMin: v })} />
                </div>
              </div>

              {/* Long break */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
                  Long break
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[15, 20, 30].map((t) => (
                    <span
                      key={t}
                      onClick={() => saveSettings({ ...settings, longBreakMin: t })}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-meta)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '4px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        background: settings.longBreakMin === t ? 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' : 'none',
                        color: settings.longBreakMin === t ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        border: settings.longBreakMin === t ? '1px solid color-mix(in srgb, var(--acc-moss) 35%, transparent)' : '1px solid var(--line-solid)',
                      }}
                    >
                      {t}m
                    </span>
                  ))}
                  <CustomMin value={settings.longBreakMin} presets={[15, 20, 30]} onChange={(v) => saveSettings({ ...settings, longBreakMin: v })} />
                </div>
              </div>
            </div>

            {/* Rounds count */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 13, borderTop: '1px dashed var(--line-dashed)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Rounds before a long break</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-faint)', marginTop: 3 }}>
                  the classic is 4
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.max(1, settings.roundsBeforeLongBreak - 1) })}
                  style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  −
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink-body)', width: 18, textAlign: 'center' }}>
                  {settings.roundsBeforeLongBreak}
                </span>
                <span
                  onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.min(10, settings.roundsBeforeLongBreak + 1) })}
                  style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  +
                </span>
              </div>
            </div>

            {/* Rhythm preview */}
            <div style={{ marginTop: 14, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '11px 13px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Your rhythm · {rhythmPreviewData.text}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, idx) => (
                  <React.Fragment key={idx}>
                    <span style={{ flex: settings.focusRoundMin, height: 8, borderRadius: 2, background: 'var(--acc-terra)', opacity: 0.85 }} />
                    {idx < settings.roundsBeforeLongBreak - 1 ? (
                      <span style={{ flex: settings.shortBreakMin, height: 8, borderRadius: 2, background: 'var(--acc-sage)' }} />
                    ) : (
                      <span style={{ flex: settings.longBreakMin, height: 8, borderRadius: 2, background: 'var(--acc-lavender)' }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                <span><span style={{ color: 'var(--acc-terra)' }}>■</span> focus {settings.focusRoundMin}</span>
                <span><span style={{ color: 'var(--acc-sage)' }}>■</span> break {settings.shortBreakMin}</span>
                <span><span style={{ color: 'var(--acc-lavender-deep)' }}>■</span> long {settings.longBreakMin}</span>
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Auto-start the next round</div>
              <Toggle on={settings.autoStartNextRound} label="Auto-start the next round" onToggle={() => saveSettings({ ...settings, autoStartNextRound: !settings.autoStartNextRound })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Auto-start breaks</div>
              <Toggle on={settings.autoStartBreaks} label="Auto-start breaks" onToggle={() => saveSettings({ ...settings, autoStartBreaks: !settings.autoStartBreaks })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Garden view on long breaks</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-faint)', marginTop: 2 }}>
                  the dusk scene opens by itself
                </div>
              </div>
              <Toggle on={settings.gardenViewOnLongBreaks} label="Garden view on long breaks" onToggle={() => saveSettings({ ...settings, gardenViewOnLongBreaks: !settings.gardenViewOnLongBreaks })} />
            </div>
            {/* Punch 52 + 8 (orchestrator patch): the chime is real again (synthesised, not the
                missing chime.mp3), and this row is now the SAME switch as Settings' "Focus round
                ends" — it writes the shared sound catalog rather than a private flag that
                decided nothing. One sound, one setting, wherever you toggle it. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Gentle chime at round's end</div>
              <Toggle on={chimeOn} label="Gentle chime at round's end" onToggle={() => {
                const next = !chimeOn
                setChimeOn(next)
                writeSoundEvents({ ...readSoundEvents(), focus_end: next })
                if (next) previewSound('focus_end')
              }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 13, borderTop: '1px dashed var(--line-dashed)' }}>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
                saves quietly, per you ✿
              </span>
              <span
                onClick={() => saveSettings(DEFAULT_SETTINGS)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer' }}
              >
                reset to classic
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
