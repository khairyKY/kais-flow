import React, { useEffect, useState, useMemo, useRef } from 'react'
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
import { blockHue, KIND_HUE } from '../calendar/blockHue'
import { upNextEvents } from '../today/upNext'
import { beginFocus } from '../today/startFocus'
import { useMinuteNow } from '../today/useMinuteNow'
import { mmss } from '../tray/focusMirror'
import { FocusTimeline } from './FocusTimeline'
import { blockFor, blockMinutes, bloomsWord, fillBlock, fitRounds, hm, keptMinutes, oneRound, planSegs, timelineOf, type FocusBlock, type Timeline } from './focusPlan'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { useDayRollover } from '../calendar/useDayRollover'
import { timeRange, timeText, zoneTimeKey } from '../calendar/eventTime'
import { EveningRitual } from '../rituals/EveningRitual'
import { readSoundEvents, writeSoundEvents, previewSound } from '../../lib/sounds'
import { useMotionEnabled } from '../../lib/motion'
import { hydrangeaAsset, daisyAsset } from '../../lib/gardenAssets'
import { cherryStage, vineStage, fernByLength, wisteriaStage } from '../../lib/growthStages'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { useAppZone } from '../../lib/appZone'
import { hourLabel } from '../../lib/clock'
import type { ActivityLogEntry, CalendarEvent } from '../../lib/types'
import { useFocusStore, DEFAULT_SETTINGS } from './focusStore'
import { checkOffFocus } from './checkOff'
import { NumberField } from '../../components/NumberField'
import { Button, Checkbox, Chip, Toggle } from '../../components/kit'
import { Skeleton, ErrorCard } from '../../components/States'
import { StageImg } from '../../components/PageMotion'
import { Icon } from '../../components/Icon'
import './FocusPage.css'
import './focusD3.css'

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
          borderRadius: 'var(--radius-pill)',
          // B D12: a custom length is the chosen chip, ink-filled; otherwise a 3:1 edge and body ink.
          color: isCustom ? 'var(--sel-ink)' : 'var(--ink-body)',
          background: isCustom ? 'var(--sel-bg)' : 'none',
          border: `1px solid ${isCustom ? 'var(--sel-bg)' : 'var(--line-control)'}`,
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
  // The Sounds row is a view onto the shared sound catalog (Settings → Sounds' own switches).
  const [sounds, setSounds] = useState(() => readSoundEvents())
  const isMobile = useIsMobile()

  // 3. Focus session state — R4-D3: owned by focusStore so a running session survives
  // navigation and is shared with the MiniFocus widget on a task's detail page.
  const {
    mode, isRunning, secondsLeft, stopwatchSeconds, stopwatchStartIso, stopwatchStartStr,
    currentRound, breakType, pomodoroStartIso, block: storeBlock, kept,
  } = useFocusStore()
  const setBlock = useFocusStore((s) => s.setBlock)
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

  // R3: a round that runs out while you watch finishes its sweep, blooms (--dur-bloom), and only
  // then cross-fades to the break ring. The store flips to break at once; this holds the view.
  const [seenMode, setSeenMode] = useState(mode)
  const [ending, setEnding] = useState(false)
  if (seenMode !== mode) {
    setSeenMode(mode)
    if (seenMode === 'pomodoro' && mode === 'break' && motionOn) setEnding(true)
  }
  useEffect(() => {
    if (!ending) return
    const t = window.setTimeout(() => setEnding(false), 600)
    return () => window.clearTimeout(t)
  }, [ending])
  // R5: leaving the garden fades it (300ms) before the timer comes back.
  const gardenRef = useRef<HTMLDivElement>(null)
  const leaveGarden = () => {
    const el = gardenRef.current
    if (!motionOn || !el || typeof el.animate !== 'function') return setMode('pomodoro')
    el.style.pointerEvents = 'none'
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.55, 0, 0.68, 0.53)', fill: 'forwards' }).onfinish = () => setMode('pomodoro')
  }

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
    if (activeTask) checkOffFocus(activeTask)
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

  // Focus D3: the block the session runs in (the store's, set by every Start focus); a session restored from
  // before D3, or none yet, shows the active task's block, made the store's on Start.
  const minuteNow = useMinuteNow()
  const block: FocusBlock = useMemo(
    () => {
      if (storeBlock) return storeBlock
      const b = blockFor(activeTask, events, settings, minuteNow)
      return { ...b, rounds: Math.max(b.rounds, kept + 1) } // rounds already kept outside a block never end its day
    },
    [storeBlock, activeTask, events, settings, minuteNow, kept],
  )
  // Up next: today's Top 3 first, then today's other open tasks — never the one in focus.
  const upNext = useMemo(() => {
    const today = (iso: string | null) => !!iso && zoneDateKey(new Date(iso), zone) === todayStr
    return tasks
      .filter((t) => t.status === 'todo' && !t.parent_task_id && t.id !== activeTask?.id && (t.top3 || today(t.due_at) || today(t.scheduled_start)))
      .sort((a, b) => (a.top3 === b.top3 ? (a.top3_rank ?? 9) - (b.top3_rank ?? 9) : a.top3 ? -1 : 1))
      .slice(0, 3)
  }, [tasks, activeTask, zone, todayStr])
  const nextEvent = useMemo(() => upNextEvents(events, minuteNow).find((e) => e.id !== block.eventId && Date.parse(e.starts_at) > minuteNow.getTime()) ?? null, [events, minuteNow, block.eventId])

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

  // Format Stopwatch time
  const formatStopwatch = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // R4: while it runs the phone's ring sweeps continuously between the 1s ticks (Effects on)
  const sweep: React.CSSProperties | undefined = motionOn && isRunning && !ending ? { transition: 'stroke-dashoffset 1s linear' } /* ds-ok: R4, the ring's own sweep */ : undefined

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
      // R5: the dusk scene fades in — the "lights down" moment.
      <div ref={gardenRef} className="fp-garden-in" style={{ position: 'absolute', inset: 0, background: 'var(--paper-linen)', zIndex: 30 }}>
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
            <StageImg bloom className="focus-sway" src={`/ds/assets/cherry/${cherryData.stage}.png`} alt="" style={{ height: 150, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {cherryData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Tasks</div>
          </div>

          {/* Bed 2: Inbox */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <span className="focus-bloom-glow-slow" style={{ position: 'absolute', left: '50%', bottom: 40, width: 110, height: 110, transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,165,90,0.35), rgba(201,165,90,0) 70%)', pointerEvents: 'none' }}></span>
            <StageImg bloom className="focus-sway" src={`/ds/assets/hydrangea/${hydrangeaData.stage}.png`} alt="" style={{ height: 120, animationDelay: '1.4s', filter: 'var(--shadow-drop-sm)', position: 'relative' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {hydrangeaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Inbox</div>
          </div>

          {/* Bed 3: Calendar */}
          <div style={{ textAlign: 'center' }}>
            <StageImg bloom className="focus-sway" src={`/ds/assets/daisy/${daisyData.stage}.png`} alt="" style={{ height: 118, animationDelay: '2.8s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {daisyData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Calendar</div>
          </div>

          {/* Bed 4: Routines */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <StageImg bloom className="focus-sway" src={`/ds/assets/vine/${vineData.stage}.png`} alt="" style={{ height: 140, animationDelay: '0.9s', filter: 'var(--shadow-drop-sm)' }} />
            <span className="focus-dew-glint" style={{ position: 'absolute', right: 8, top: 26, width: 9, height: 9, background: 'radial-gradient(circle at 40% 40%, var(--star, #FDFBF4), transparent 65%)', borderRadius: '50%' }}></span>
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {vineData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Routines</div>
          </div>

          {/* Bed 5: Journal */}
          <div style={{ textAlign: 'center' }}>
            <StageImg bloom className="focus-sway" src={`/ds/assets/fern/${fernData.stage}.png`} alt="" style={{ height: 124, animationDelay: '3.6s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {fernData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Journal</div>
          </div>

          {/* Bed 6: Projects */}
          <div style={{ textAlign: 'center' }}>
            <StageImg bloom className="focus-sway" src={`/ds/assets/wisteria/${wisteriaData.stage}.png`} alt="" style={{ height: 136, animationDelay: '1.9s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
              {wisteriaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Projects</div>
          </div>

          {/* Bed 7: People */}
          <div style={{ textAlign: 'center' }}>
            <StageImg bloom className="focus-sway" src={`/ds/assets/clover/${cloverData.stage}.png`} alt="" style={{ height: 86, animationDelay: '4.4s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontSize: 'var(--fs-body-s)', color: '#5f5a6e' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, marginTop: 10 }}>
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

        {/* Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '30px 40px', zIndex: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: '#b8b0c8' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */ }}>
              Your garden{activityQ.data ? ` · day ${stats.daysCount}` : ''}
            </div>
            <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, letterSpacing: 'var(--ls-display)', color: '#f0ebdd' }}>
              {weekdayName}, closing
            </h1>
          </div>
          {!gardenPending && !gardenFailed && <div style={{ display: 'flex', gap: 8 }}>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>{/* ds-ok: the dusk scene keeps its own palette (B D2) */}
              {stats.completedToday} task{stats.completedToday === 1 ? '' : 's'} done
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>{/* ds-ok: the dusk scene keeps its own palette (B D2) */}
              {stats.timeText}
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>{/* ds-ok: the dusk scene keeps its own palette (B D2) */}
              {vineData.streak}-day streak
            </span>
          </div>}
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px', zIndex: 20 }}>
          <span style={{ fontSize: 'var(--fs-body)', color: '#c9c0d8' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */ }}>
            Everything tended, nothing waiting ✿
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              onClick={leaveGarden}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: '#a89fc0' /* ds-ok: the dusk scene keeps its own palette (B D2: colour as it was) */, cursor: 'pointer' }}
            >
              Stay a while
            </span>
            {/* Punch 52: the CTA says "evening ritual" and used to open the *weekly* review.
                The evening ritual has no route of its own — it's a fixed-inset overlay that
                Today and Routines mount from local state — so Focus mounts it the same way. */}
            <Button type="button" onClick={() => setEveningOpen(true)}>
              Close the day → evening ritual
            </Button>
          </div>
        </div>

        {eveningOpen && <EveningRitual onClose={() => setEveningOpen(false)} />}
      </div>
    )
  }

  // 6. Focus D3 (design-export/Focus redesign.html §D3, Kai's pick: the timer in the middle, flower (i), break
  // option 1). Desktop: the hour column (the block's segments, no flowers), the segmented timeline with blooms
  // across the top, the timer centred with a small cherry beside it that grows through the round, Up next, the
  // buttons; no ring. Phone: D's running screen (the flower in the ring). The stopwatch keeps its own view.
  const session = { mode, isRunning, secondsLeft, pomodoroStartIso, breakType, block, kept }
  const timeline = timelineOf(session, settings)!
  // R3: while the round-end bloom plays the store is already on the break; the page still shows the round's end.
  const tl: Timeline = ending ? { ...timeline, cur: -1, phase: 'end' } : timeline
  const phase = tl.phase
  const fresh = phase === 'idle' && kept === 0
  const budN = Math.min(kept + 1, block.rounds)
  const breakMin = breakType === 'long' ? settings.longBreakMin : settings.shortBreakMin
  const at = (secs: number) => timeText(new Date(Date.now() + secs * 1000), zone)
  const span = timeRange(new Date(block.start), new Date(block.end), zone).replace('–', ' – ')
  const lastFocusEnd = new Date(Date.parse(block.start) + planSegs(block.rounds, blockMinutes(block), settings).filter((s) => s.k !== 'x').reduce((n, s) => n + s.min, 0) * 60_000)
  const breakText = `Break · ${mmss(ending ? breakMin * 60 : secondsLeft)}`
  const mid = new Date((Date.parse(block.start) + Date.parse(block.end)) / 2)
  const tlLabels = [timeText(new Date(block.start), zone), timeText(mid, zone), timeText(new Date(block.end), zone)] as const
  const ensureBlock = () => {
    if (!storeBlock) setBlock(block)
  }
  const startRound = () => {
    ensureBlock()
    if (mode !== 'pomodoro') setMode('pomodoro')
    togglePlay()
  }
  const endEarly = () => {
    setIsRunning(false)
    setSecondsLeft(settings.focusRoundMin * 60)
    setPomodoroStartIso(null)
  }
  const nextRound = (run: boolean) => {
    setMode('pomodoro')
    setSecondsLeft(settings.focusRoundMin * 60)
    setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
    if (run) togglePlay()
  }

  const head = (
    <div className="fd-tlhead">
      <span className="fd-tlname">
        <span className="fd-swatch" style={{ background: block.color }} aria-hidden />
        {block.title} · {span}
      </span>
      <span className="fd-tlkept">{phase === 'idle' && fresh ? `planned ${hm(blockMinutes(block))}` : `kept ${hm(keptMinutes(session, settings))} of ${hm(blockMinutes(block))}`}</span>
    </div>
  )
  const topTimeline = (
    <div className="fd-tl">
      {head}
      <FocusTimeline tl={tl} color={block.color} flowers labels={tlLabels} breakLabel={breakText} />
    </div>
  )

  // The small flower (i): a bud that opens as the round runs, a bloom at its end; on a break it closes to a
  // bud and a sage glow breathes behind it (break option 1). Paused, it waits at 55%.
  const stage = phase === 'end' || phase === 'done' ? 'bloom' : phase === 'break' || (phase === 'idle' && fresh) ? 'bud' : tl.frac < 0.2 ? 'bud' : 'opening'
  const flower = (size: number, inRing = false) => (
    <span className={`fd-flower is-${phase}${inRing ? ' in-ring' : ''}`} style={{ '--fd-flower': `${size}px` } as React.CSSProperties}>
      {phase === 'end' && <span className="fp-round-bloom" aria-hidden />}
      {phase === 'break' && <span className="fd-breath" aria-hidden />}
      <StageImg bloom src={`/ds/assets/cherry/${stage}.png`} alt="" className="fd-flower-img" />
    </span>
  )

  const big = (phone: boolean) => {
    if (phase === 'end')
      return (
        <div className="fd-bigwrap">
          <div className="fd-big fd-big--end">Bud {kept} bloomed ✿</div>
          <div className="fd-meta">
            {settings.focusRoundMin} min {activeTask ? `logged${activeProject ? ` to ${activeProject.name}` : ''}` : 'kept'}
          </div>
        </div>
      )
    if (phase === 'break')
      return (
        <div className="fd-bigwrap fp-break-in">
          <div className="fd-big fd-big--break">{breakText}</div>
          <div className="fd-meta">{phone ? 'The bud rests · stand up, water something real ✿' : `The bud rests · bud ${budN} at ${at(secondsLeft)}`}</div>
        </div>
      )
    const paused = phase === 'paused'
    return (
      <div className="fd-bigwrap">
        <div className={`fd-big fd-dim${paused ? ' is-paused' : ''}`}>{mmss(secondsLeft)}</div>
        <div className="fd-meta">
          {paused ? 'Paused · the bud waits' : phase === 'idle' ? `Bud ${budN} of ${block.rounds} · ready` : `Bud ${budN} of ${block.rounds} · ${budN >= block.rounds ? 'ends' : `${currentRound >= settings.roundsBeforeLongBreak ? 'long ' : ''}break`} at ${at(secondsLeft)}`}
        </div>
      </div>
    )
  }

  const taskLine = (phone: boolean) => (
    <div className={`fd-task${phone ? ' fd-task--phone' : ''}`}>
      <Checkbox checked={false} size={phone ? 17 : 19} label={activeTask?.title} disabled={!activeTask} onChange={handleCheckOff} />
      <span ref={pickerAnchor} className="fd-task-t" onClick={() => setTaskPickerOpen(!taskPickerOpen)} title="Click to select another task">
        {activeTask ? activeTask.title : 'No task — a plain round'}
      </span>
      {activeTask?.top3 && <span className="fd-star">★</span>}
      {taskPickerOpen && <TaskPicker tasks={tasks} anchorRef={pickerAnchor} onPick={handleSelectTask} onClose={() => setTaskPickerOpen(false)} />}
    </div>
  )

  const lengths = [25, 45, 50]
  const idle = (phone: boolean) => (
    <div className="fd-idle">
      {block.fromCalendar && <div className="fd-meta">From your calendar</div>}
      {tasksQ.isPending ? (
        <Skeleton rows={1} />
      ) : tasksQ.isError && !tasksQ.data ? (
        <ErrorCard message="Couldn't load your tasks." onRetry={() => void tasksQ.refetch()} />
      ) : (
        <div className="fd-pick">
          <span ref={pickerAnchor} className="fd-pick-t" onClick={() => setTaskPickerOpen(!taskPickerOpen)} title="Click to select another task">
            {activeTask ? activeTask.title : 'Choose a task'}
          </span>
          <Icon name="chevdown" size={20} className="fd-chev" />
          {taskPickerOpen && <TaskPicker tasks={tasks} anchorRef={pickerAnchor} onPick={handleSelectTask} onClose={() => setTaskPickerOpen(false)} />}
        </div>
      )}
      <div className="fd-chips">
        {Date.parse(block.srcEnd) - Date.parse(block.srcStart) > settings.focusRoundMin * 60_000 && (
          <Chip tone="filter" selected={block.fill} onClick={() => setBlock(fillBlock(block, settings, new Date()))}>
            Fill the block · {block.fill ? block.rounds : fitRounds(Math.round((Date.parse(block.srcEnd) - Math.max(Date.now(), Date.parse(block.srcStart))) / 60_000), settings)} buds
          </Chip>
        )}
        {lengths.map((m) => (
          <Chip key={m} tone="filter" selected={!block.fill && settings.focusRoundMin === m} onClick={() => { saveSettings({ ...settings, focusRoundMin: m }); setBlock(oneRound(block, m, new Date())) }}>
            {m}m
          </Chip>
        ))}
      </div>
      <div className="fd-meta">
        {block.rounds} {block.rounds === 1 ? 'round' : 'rounds'} of {settings.focusRoundMin}
        {block.rounds > 1 ? ` · ${block.rounds - 1} ${block.rounds - 1 === 1 ? 'break' : 'breaks'}` : ''} · ends {timeText(lastFocusEnd, zone)}
        {!phone && ' · '}
        {!phone && (
          <button type="button" className="fd-link" onClick={() => setMode('stopwatch')}>
            Stopwatch instead
          </button>
        )}
      </div>
    </div>
  )

  const buttons = (phone: boolean): React.ReactNode[] => {
    if (phase === 'idle')
      return [
        <Button key="start" type="button" className={fresh ? 'fd-start' : undefined} onClick={startRound}>
          ▶ {fresh ? 'Start the first bud' : `Start bud ${budN}`}
        </Button>,
      ]
    if (phase === 'end')
      return [
        <Button key="break" type="button" onClick={() => { if (!isRunning) setIsRunning(true) }}>
          Break · {breakMin} min
        </Button>,
        <Button key="skip" type="button" variant="secondary" onClick={() => nextRound(true)}>
          Skip to bud {budN}
        </Button>,
      ]
    if (phase === 'break')
      return [
        <Button key="skip" type="button" variant="secondary" onClick={() => nextRound(false)}>
          Skip break
        </Button>,
        <Button key="back" type="button" onClick={() => nextRound(true)}>
          Back to work →
        </Button>,
      ]
    const paused = phase === 'paused'
    return [
      <Button key="toggle" type="button" variant={paused ? 'cta' : 'secondary'} onClick={togglePlay}>
        {paused ? '▶ Resume' : '❙❙ Pause'}
      </Button>,
      <Button key="done" type="button" variant={paused ? 'secondary' : 'cta'} onClick={handleCheckOff} disabled={!activeTask}>
        ✓ Done
      </Button>,
      <Button key="five" type="button" variant="secondary" onClick={addFiveMinutes}>
        +5 min
      </Button>,
      ...(phone ? [] : [
        <Button key="end" type="button" variant="ghost" onClick={endEarly}>
          End early
        </Button>,
      ]),
    ]
  }

  const nextTask = upNext[0] ?? null
  const done = (phone: boolean) => (
    <div className={`fd-done${phone ? ' fd-done--phone' : ''}`}>
      <div className="fd-meta">{block.title} · {span}</div>
      <div className="fd-done-t">{bloomsWord(kept)} on the block ✿</div>
      <div className="fd-tl fd-tl--done">
        {head}
        <FocusTimeline tl={tl} color={block.color} flowers labels={tlLabels} />
      </div>
      <div className="fd-ledger">
        <span className="fd-meta">Task</span>
        <span className="fd-meta">Planned</span>
        <span className="fd-meta">Kept</span>
        <span>{activeTask?.title ?? 'A plain round'}</span>
        <span className="fd-num">{hm(blockMinutes(block))}</span>
        <b className="fd-num">{hm(kept * settings.focusRoundMin)}</b>
      </div>
      <div className="fd-done-btns">
        {nextTask && <Button type="button" onClick={() => beginFocus(nextTask)}>Next: {nextTask.title} ▶</Button>}
        <Button type="button" variant="secondary" onClick={() => setBlock(null)}>
          Close the block
        </Button>
      </div>
      {nextEvent && <div className="fd-meta fd-done-note">Next block · {nextEvent.title} at {timeText(new Date(nextEvent.starts_at), zone)}</div>}
    </div>
  )

  const stopwatch = (
    <div className="fd-stopwatch">
      <div className="fd-sw-time">
        <span className="fd-big fd-big--sw">{formatStopwatch(stopwatchSeconds)}</span>
        <span className="focus-bloom-glow fd-sw-dot" />
      </div>
      <div className="fd-meta">
        {isRunning ? 'Recording' : 'Paused'}
        {stopwatchStartStr ? ` · started ${stopwatchStartStr}` : ''}
      </div>
      {taskLine(isMobile)}
      <div className="fd-sw-panel">
        <div className="fd-meta">On stop, this lands automatically</div>
        <div className="fd-sw-row">
          <span className="chip fd-sw-chip">Work · {Math.round(stopwatchSeconds / 60)}m</span>
          <span className="fd-sw-dest">Projects → {activeProject ? activeProject.name : 'Unlinked'} → Activity</span>
          {stopwatchProjectedHours && (
            <span className="fd-meta fd-sw-hours">
              Hours {stopwatchProjectedHours.before} → <b>{stopwatchProjectedHours.after}</b>
            </span>
          )}
        </div>
        <input type="text" className="fd-sw-note" placeholder="What are you working on? (Optional note)" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </div>
      <div className="fd-btns">
        <Button type="button" variant="secondary" onClick={togglePlay}>
          {isRunning ? '❙❙ Pause' : '▶ Start'}
        </Button>
        <Button type="button" onClick={handleStopAndLog} disabled={stopwatchSeconds === 0}>
          Stop &amp; log ✓
        </Button>
        <Button type="button" variant="ghost" onClick={handleDiscardStopwatch}>
          Discard
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('pomodoro')}>
          Rounds instead
        </Button>
      </div>
    </div>
  )

  const gear = (
    <button type="button" className="fd-gear kf-hit" aria-label="Focus settings" title="Focus settings" onClick={() => setIsSettingsOpen(true)}>
      <GearIcon />
    </button>
  )

  const settingsBody = (
    <div className="fd-settings">
      <div className="fd-slabel">Focus round</div>
      <div className="fd-chips fd-chips--left">
        {[15, 25, 45, 50].map((t) => (
          <Chip key={t} tone="filter" selected={settings.focusRoundMin === t} onClick={() => saveSettings({ ...settings, focusRoundMin: t })}>
            {t}m
          </Chip>
        ))}
        <CustomMin value={settings.focusRoundMin} presets={[15, 25, 45, 50]} onChange={(v) => saveSettings({ ...settings, focusRoundMin: v })} />
      </div>
      <div className="fp-breaks fd-breaks">
        <div>
          <div className="fd-slabel">Short break</div>
          <div className="fd-chips fd-chips--left">
            {[3, 5, 10].map((t) => (
              <Chip key={t} tone="filter" selected={settings.shortBreakMin === t} onClick={() => saveSettings({ ...settings, shortBreakMin: t })}>
                {t}m
              </Chip>
            ))}
            <CustomMin value={settings.shortBreakMin} presets={[3, 5, 10]} onChange={(v) => saveSettings({ ...settings, shortBreakMin: v })} />
          </div>
        </div>
        <div>
          <div className="fd-slabel">Long break</div>
          <div className="fd-chips fd-chips--left">
            {[15, 20, 30].map((t) => (
              <Chip key={t} tone="filter" selected={settings.longBreakMin === t} onClick={() => saveSettings({ ...settings, longBreakMin: t })}>
                {t}m
              </Chip>
            ))}
            <CustomMin value={settings.longBreakMin} presets={[15, 20, 30]} onChange={(v) => saveSettings({ ...settings, longBreakMin: v })} />
          </div>
        </div>
      </div>
      <div className="fd-srow">
        <div>Rounds before a long break</div>
        <div className="fd-stepper">
          <button type="button" aria-label="One fewer" onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.max(1, settings.roundsBeforeLongBreak - 1) })}>−</button>
          <b>{settings.roundsBeforeLongBreak}</b>
          <button type="button" aria-label="One more" onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.min(10, settings.roundsBeforeLongBreak + 1) })}>+</button>
        </div>
      </div>
      <div className="fd-rhythm-wrap">
        <div className="fd-meta">Your rhythm · {rhythmPreviewData.text}</div>
        <div className="fd-rhythm">
          {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, idx) => (
            <React.Fragment key={idx}>
              <span style={{ flex: settings.focusRoundMin, background: 'var(--acc-terra)' }} />
              <span style={{ flex: idx < settings.roundsBeforeLongBreak - 1 ? settings.shortBreakMin : settings.longBreakMin, background: idx < settings.roundsBeforeLongBreak - 1 ? 'var(--acc-sage)' : 'var(--acc-lavender)' }} />
            </React.Fragment>
          ))}
        </div>
      </div>
      {(
        [
          ['Fit rounds to the block', 'A 2h block becomes 4 buds', 'fitBlock'],
          ['Focus pill on other pages', isMobile ? 'Above the tab bar' : 'Rides at the bottom while you work elsewhere', 'pill'],
          ['Start the next round by itself', '', 'autoStartNextRound'],
          ['Start breaks by itself', '', 'autoStartBreaks'],
          ['Garden view on long breaks', 'The dusk scene opens by itself', 'gardenViewOnLongBreaks'],
        ] as const
      ).map(([label, sub, key]) => (
        <div key={key} className="fd-srow">
          <div>
            {label}
            {sub && <div className="fd-meta">{sub}</div>}
          </div>
          <Toggle on={settings[key]} label={label} onToggle={() => saveSettings({ ...settings, [key]: !settings[key] })} />
        </div>
      ))}
      {/* Punch 52 + 8: the same switches as Settings → Sounds (the shared catalog), one per end of a round. */}
      <div className="fd-srow">
        <div>
          Sounds
          <div className="fd-meta">A chime when a round starts and ends</div>
        </div>
        <div className="fd-chips fd-chips--left">
          {(['focus_start', 'focus_end'] as const).map((k) => (
            <Chip key={k} tone="filter" selected={sounds[k]} onClick={() => {
              const next = { ...readSoundEvents(), [k]: !sounds[k] }
              writeSoundEvents(next)
              setSounds(next)
              if (next[k]) previewSound(k)
            }}>
              {k === 'focus_start' ? 'Start' : 'End'}
            </Chip>
          ))}
        </div>
      </div>
      <div className="fd-srow">
        <span className="fd-meta">Saves quietly, per you ✿</span>
        <Button type="button" variant="ghost" onClick={() => saveSettings(DEFAULT_SETTINGS)}>
          Reset to classic
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    const ringPct = phase === 'break' ? tl.frac : phase === 'end' ? 1 : tl.frac
    const R = 210
    const r = (R - 3) / 2
    const c = 2 * Math.PI * r
    const plant = (
      <div className={`fd-plant is-${phase}`}>
        <svg className={`fp-ring${phase === 'paused' ? ' is-paused' : ''}`} width={R} height={R} viewBox={`0 0 ${R} ${R}`} aria-hidden>
          <circle cx={R / 2} cy={R / 2} r={r} fill="none" stroke="var(--line-card)" strokeWidth="3" />
          {ringPct > 0 && <circle cx={R / 2} cy={R / 2} r={r} fill="none" stroke="var(--acc-sage)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ringPct)} style={sweep} />}
        </svg>
        {flower(phase === 'break' || stage === 'bud' ? 105 : 130, true)}
      </div>
    )
    return (
      <div className="focus-bleed fd-phone">
        <div className="fd-phead">
          <span className="fd-ptitle">Focus</span>
          {gear}
        </div>
        {mode === 'stopwatch' ? (
          stopwatch
        ) : phase === 'done' ? (
          done(true)
        ) : (
          <>
            {fresh && idle(true)}
            <div className="fd-tl">
              {head}
              <FocusTimeline tl={tl} color={block.color} flowers labels={tlLabels} breakLabel={breakText} />
            </div>
            {plant}
            {!fresh && (
              <div className="fd-pbig">
                {big(true)}
                {(phase === 'running' || phase === 'paused' || phase === 'idle') && taskLine(true)}
              </div>
            )}
            <div className="fd-btns fd-btns--phone">{buttons(true)}</div>
            {fresh && (
              <button type="button" className="fd-link fd-link--center" onClick={() => setMode('stopwatch')}>
                Stopwatch instead
              </button>
            )}
            {(phase === 'running' || phase === 'paused') && (upNext[0] || nextEvent) && (
              <div className="fd-pnext">
                <span>{upNext[0] ? `Up next · ${upNext[0].title}` : 'Up next'}</span>
                {nextEvent && <span className="fd-meta">{nextEvent.title} {timeText(new Date(nextEvent.starts_at), zone)}</span>}
              </div>
            )}
          </>
        )}
        {isSettingsOpen && (
          <BottomSheet onClose={() => setIsSettingsOpen(false)} title="Focus settings">
            {() => settingsBody}
          </BottomSheet>
        )}
      </div>
    )
  }

  return (
    <div className="focus-bleed fd-wrap">
    <div className="fd">
      <div className="fd-top">
        <span className="fd-crumb">Focus{phase === 'idle' && fresh ? '' : ` · ${block.title} · ${span}`}</span>
        <span className="fd-topr">
          <span className="fp-esc fd-meta">Esc leaves quietly</span>
          {gear}
        </span>
      </div>
      <aside className="fd-hours" aria-label="Today around the block">
        <HourColumn block={block} tl={tl} events={events} zone={zone} />
      </aside>
      <main className="fd-centre">
        {mode === 'stopwatch' ? (
          stopwatch
        ) : phase === 'done' ? (
          done(false)
        ) : (
          <>
            {topTimeline}
            {!fresh && taskLine(false)}
            <div className="fd-row">
              {fresh ? idle(false) : big(false)}
              {flower(fresh ? 90 : 120)}
            </div>
            <div className="fd-btns">{buttons(false)}</div>
          </>
        )}
      </main>
      <aside className="fd-next" aria-label="Up next">
        <div className="fd-next-h">Up next</div>
        {upNext.length === 0 && <div className="fd-meta">Nothing else on today ✿</div>}
        {upNext.map((t) => (
          <div key={t.id} className="fd-next-row">
            <Checkbox checked={false} size={16} label={t.title} onChange={() => completeTaskWithUndo(t)} />
            <button type="button" className="fd-next-t" onClick={() => handleSelectTask(t.id)} title="Focus on this next">
              {t.title}
            </button>
            {t.top3 && <span className="fd-star">★</span>}
            {t.duration_min ? <span className="fd-meta">{hm(t.duration_min)}</span> : null}
          </div>
        ))}
        {nextEvent && (
          <div className="fd-next-block" style={{ background: `color-mix(in srgb, ${hueOfEvent(nextEvent).c} var(--blk-fill), transparent)`, color: hueOfEvent(nextEvent).ink }}>
            Next block · {nextEvent.title} · {timeText(new Date(nextEvent.starts_at), zone)}
          </div>
        )}
      </aside>
      {isSettingsOpen && (
        <div className="fp-scrim-in fd-scrim" onClick={(e) => e.target === e.currentTarget && setIsSettingsOpen(false)}>
          <div className="fp-card-in fd-sheet" role="dialog" aria-label="Focus settings">
            <div className="fd-sheet-h">
              <b>Focus settings</b>
              <button type="button" className="fd-x kf-hit" aria-label="Close" onClick={() => setIsSettingsOpen(false)}>
                ✕
              </button>
            </div>
            {settingsBody}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

/** A block's accent and text tone: its own colour, else its kind's (calendar/blockHue). */
function hueOfEvent(e: Pick<CalendarEvent, 'color' | 'type' | 'task_id'>) {
  return e.color ? blockHue(e.color) : e.type === 'event' && !e.task_id ? KIND_HUE.event : KIND_HUE.task
}

const minOfDay = (d: Date, zone: string) => {
  const [h, m] = zoneTimeKey(d, zone).split(':').map(Number)
  return h * 60 + m
}

/** D3's hour column: six hours around the block, today's other blocks as they are, the focus block split into
 * its segments in its own colour — no flowers here — and the now line. */
function HourColumn({ block, tl, events, zone }: { block: FocusBlock; tl: Timeline; events: readonly CalendarEvent[]; zone: string }) {
  const now = useMinuteNow()
  const day = zoneDateKey(new Date(block.srcStart), zone)
  const startMin = minOfDay(new Date(block.srcStart), zone)
  const from = Math.max(0, Math.min(18 * 60, Math.floor(startMin / 60) * 60 - 60))
  const SPAN = 6 * 60
  const pct = (m: number) => `${(((m - from) / SPAN) * 100).toFixed(2)}%`
  const placed = (s: Date, e: Date) => {
    const a = Math.max(from, minOfDay(s, zone))
    const b = Math.min(from + SPAN, zoneDateKey(e, zone) === day ? minOfDay(e, zone) : 24 * 60)
    return b > a ? { top: pct(a), height: `${(((b - a) / SPAN) * 100).toFixed(2)}%` } : null
  }
  const others = events.filter((e) => !e.all_day && e.id !== block.eventId && zoneDateKey(new Date(e.starts_at), zone) === day)
  const own = placed(new Date(block.srcStart), new Date(block.srcEnd))
  const srcLen = Date.parse(block.srcEnd) - Date.parse(block.srcStart)
  const planTop = srcLen > 0 ? Math.max(0, (Date.parse(block.start) - Date.parse(block.srcStart)) / srcLen) : 0
  const planH = srcLen > 0 ? Math.min(1 - planTop, (Date.parse(block.end) - Date.parse(block.start)) / srcLen) : 1
  const nowMin = zoneDateKey(now, zone) === day ? minOfDay(now, zone) : -1
  return (
    <div className="fd-hcol">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="fd-hline" style={{ top: pct(from + i * 60) }}>
          {hourLabel(Math.floor(from / 60) + i)}
        </div>
      ))}
      {others.map((e) => {
        const p = placed(new Date(e.starts_at), new Date(e.ends_at))
        if (!p) return null
        const h = hueOfEvent(e)
        return (
          <div key={e.id} className="fd-hblk" style={{ ...p, background: `color-mix(in srgb, ${h.c} var(--blk-fill), transparent)`, color: h.ink }}>
            <b>{e.title}</b>
          </div>
        )
      })}
      {own && (
        <div className="fd-hblk fd-hblk--focus" style={{ ...own, background: `color-mix(in srgb, ${block.color} var(--blk-fill), transparent)`, color: block.ink }} data-focus-block>
          <b>{block.title}</b>
          <div className="fd-hblk-span">{timeRange(new Date(block.srcStart), new Date(block.srcEnd), zone).replace('–', ' – ')}</div>
          <div className="fd-hsegs">
            <FocusTimeline vertical tl={tl} color={block.color} style={{ position: 'absolute', left: 0, right: 0, top: `${planTop * 100}%`, height: `${planH * 100}%` }} />
          </div>
        </div>
      )}
      {nowMin >= from && nowMin <= from + SPAN && <div className="fd-nowline" style={{ top: pct(nowMin) }} />}
    </div>
  )
}
